import {
  BadRequestException,
  ForbiddenException,
  Inject,
  forwardRef,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, FindOptionsWhere, In, Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHash, randomUUID } from 'crypto';

import { SmsMessage, MessageStatus } from './entities/sms.entity';
import { CreateMessageDto } from './dto/create-message.dto';
import { QueryMessagesDto } from './dto/query-messages.dto';
import { CreateBulkMessageDto } from './dto/create-bulk-message.dto';
import { UpdateScheduledMessageDto } from './dto/update-scheduled-message.dto';
import { QueryFailedMessagesDto } from './dto/query-failed-messages.dto';
import {
  SMS_JOB_SEND,
  SMS_QUEUE,
  SMS_MAX_RETRIES,
  SMS_RETRY_DELAY_MS,
} from './constants/sms.constants';
import { TenantsService } from '../tenants/tenants.service';
import { Contact } from '../contacts/entities/contact.entity';
import { ContactGroup } from '../contacts/entities/contact-group.entity';
import { CampaignsService } from '../campaigns/campaigns.service';
import { MessageTemplatesService } from '../message-templates/message-templates.service';

type CurrentUser = {
  id: string;
  tenantId: string;
  role: string;
};

type TenantMessagePriority = 'normal' | 'high' | 'critical';

type SafeSmsMessage = Omit<
  SmsMessage,
  'recipient' | 'content' | 'createdByUserId' | 'idempotencyKey' | 'scheduledJobId'
> & {
  recipient: string;
  content: string;
  isRestricted?: boolean;
};

function getBullMqPriority(priority?: string) {
  const normalized = (priority ?? 'normal') as TenantMessagePriority;

  if (normalized === 'critical') return 1;
  if (normalized === 'high') return 5;

  return 10;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(
    @InjectRepository(SmsMessage)
    private readonly smsRepository: Repository<SmsMessage>,

    @InjectRepository(Contact)
    private readonly contactsRepository: Repository<Contact>,

    @InjectRepository(ContactGroup)
    private readonly contactGroupsRepository: Repository<ContactGroup>,

    @InjectQueue(SMS_QUEUE)
    private readonly smsQueue: Queue,

    private readonly tenantsService: TenantsService,

    @Inject(forwardRef(() => CampaignsService))
    private readonly campaignsService: CampaignsService,

    private readonly messageTemplatesService: MessageTemplatesService,
  ) {}

  async createMessage(
    dto: CreateMessageDto & {
      forceSend?: boolean;
      campaignId?: string | null;
    },
    currentUser: CurrentUser,
  ) {
    this.assertNotSuperAdminMessageWrite(currentUser);

    const recipient = this.normalizePhone(dto.recipient);
    const content = dto.content.trim();
    const forceSend = dto.forceSend === true;

    if (!recipient) {
      throw new BadRequestException('Recipient is required');
    }

    if (!content) {
      throw new BadRequestException('Message content is required');
    }

    const scheduledDate = dto.scheduledAt ? new Date(dto.scheduledAt) : null;

    const isScheduled =
      scheduledDate instanceof Date &&
      !Number.isNaN(scheduledDate.getTime()) &&
      scheduledDate.getTime() > Date.now();

    const idempotencyNonce = forceSend
      ? randomUUID()
      : isScheduled
        ? scheduledDate!.toISOString()
        : undefined;

    const idempotencyKey = this.buildIdempotencyKey(
      currentUser.tenantId,
      recipient,
      content,
      idempotencyNonce,
    );

    if (!forceSend) {
      const existing = await this.smsRepository.findOne({
        where: {
          tenantId: currentUser.tenantId,
          idempotencyKey,
        },
        order: {
          createdAt: 'DESC',
        },
      });

      if (
        existing &&
        [
          MessageStatus.PENDING,
          MessageStatus.SCHEDULED,
          MessageStatus.QUEUED,
          MessageStatus.PROCESSING,
          MessageStatus.SENT,
          MessageStatus.DELIVERED,
        ].includes(existing.status)
      ) {
        return this.sanitizeMessageForUser(existing, currentUser);
      }
    }

    const tenantUsage = await this.tenantsService.assertCanSendMessages(
      currentUser.tenantId,
      1,
    );

    const queuePriority = getBullMqPriority(tenantUsage.messagePriority);

    const message = this.smsRepository.create({
      recipient,
      content,
      tenantId: currentUser.tenantId,
      campaignId: dto.campaignId ?? null,
      createdByUserId: currentUser.id,
      status: isScheduled ? MessageStatus.SCHEDULED : MessageStatus.PENDING,
      scheduledAt: isScheduled ? scheduledDate : undefined,
      idempotencyKey,
    });

    const savedMessage = await this.smsRepository.save(message);

    this.logger.log(
      JSON.stringify({
        event: isScheduled ? 'schedule_sms_create' : 'queue_sms_create',
        messageId: savedMessage.id,
        recipient,
        forceSend,
        scheduledAt: isScheduled ? scheduledDate?.toISOString() : null,
        idempotencyKey,
        tenantPriority: tenantUsage.messagePriority,
        queuePriority,
      }),
    );

    const job = await this.smsQueue.add(
      SMS_JOB_SEND,
      {
        messageId: savedMessage.id,
        tenantId: savedMessage.tenantId,
        campaignId: savedMessage.campaignId ?? null,
        createdByUserId: savedMessage.createdByUserId,
        recipient: savedMessage.recipient,
        content: savedMessage.content,
        idempotencyKey: savedMessage.idempotencyKey,
      },
      {
        delay: isScheduled
          ? Math.max(0, scheduledDate!.getTime() - Date.now())
          : 0,
        priority: queuePriority,
        attempts: SMS_MAX_RETRIES,
        backoff: {
          type: 'exponential',
          delay: SMS_RETRY_DELAY_MS,
        },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    );

    await this.smsRepository.update(savedMessage.id, {
      status: isScheduled ? MessageStatus.SCHEDULED : MessageStatus.QUEUED,
      scheduledJobId: job.id?.toString(),
    });

    this.logger.log(
      isScheduled
        ? `Message ${savedMessage.id} scheduled for ${scheduledDate?.toISOString()}`
        : `Message ${savedMessage.id} queued to ${recipient}`,
    );

    return this.findOne(savedMessage.id, currentUser);
  }

  async createBulkMessages(
    dto: CreateBulkMessageDto,
    currentUser: CurrentUser,
  ) {
    this.assertNotSuperAdminMessageWrite(currentUser);

    let content = dto.content.trim();
    const forceSend = dto.forceSend === true;

    if (dto.templateId) {
      const template = await this.messageTemplatesService.findOne(
        dto.templateId,
        currentUser,
      );

      if (!template.isActive) {
        throw new ForbiddenException('Message template is inactive');
      }

      content = template.content.trim();
    }

    if (!content) {
      throw new BadRequestException('Message content is required');
    }

    const { recipients, contactMap } =
      await this.resolveBulkRecipientsWithContacts(dto, currentUser);

    const normalizedRecipients = recipients
      .map((recipient) => this.normalizePhone(recipient))
      .filter(Boolean);

    const uniqueRecipients = [...new Set(normalizedRecipients)];

    if (!uniqueRecipients.length) {
      throw new BadRequestException('At least one valid recipient is required');
    }

    const duplicatesRemoved =
      normalizedRecipients.length - uniqueRecipients.length;

    const scheduledDate = dto.scheduledAt ? new Date(dto.scheduledAt) : null;

    const isScheduled =
      scheduledDate instanceof Date &&
      !Number.isNaN(scheduledDate.getTime()) &&
      scheduledDate.getTime() > Date.now();

    const tenantUsage = await this.tenantsService.assertCanSendMessages(
      currentUser.tenantId,
      uniqueRecipients.length,
    );

    const queuePriority = getBullMqPriority(tenantUsage.messagePriority);

    const savedMessages: SmsMessage[] = [];

    for (const recipient of uniqueRecipients) {
      const contact = contactMap.get(recipient);

      const personalizedContent = contact
        ? this.messageTemplatesService.renderTemplate(content, contact)
        : content;

      const idempotencyNonce = forceSend
        ? randomUUID()
        : isScheduled
          ? `${scheduledDate!.toISOString()}-${recipient}`
          : randomUUID();

      const idempotencyKey = this.buildIdempotencyKey(
        currentUser.tenantId,
        recipient,
        personalizedContent,
        idempotencyNonce,
      );

      const message = this.smsRepository.create({
        recipient,
        content: personalizedContent,
        tenantId: currentUser.tenantId,
        createdByUserId: currentUser.id,
        status: isScheduled ? MessageStatus.SCHEDULED : MessageStatus.PENDING,
        scheduledAt: isScheduled ? scheduledDate : undefined,
        idempotencyKey,
      });

      const savedMessage = await this.smsRepository.save(message);

      const job = await this.smsQueue.add(
        SMS_JOB_SEND,
        {
          messageId: savedMessage.id,
          tenantId: savedMessage.tenantId,
          createdByUserId: savedMessage.createdByUserId,
          recipient: savedMessage.recipient,
          content: savedMessage.content,
          idempotencyKey: savedMessage.idempotencyKey,
        },
        {
          delay: isScheduled
            ? Math.max(0, scheduledDate!.getTime() - Date.now())
            : 0,
          priority: queuePriority,
          attempts: SMS_MAX_RETRIES,
          backoff: {
            type: 'exponential',
            delay: SMS_RETRY_DELAY_MS,
          },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      );

      await this.smsRepository.update(savedMessage.id, {
        status: isScheduled ? MessageStatus.SCHEDULED : MessageStatus.QUEUED,
        scheduledJobId: job.id?.toString(),
      });

      savedMessages.push({
        ...savedMessage,
        status: isScheduled ? MessageStatus.SCHEDULED : MessageStatus.QUEUED,
        scheduledJobId: job.id?.toString(),
      } as SmsMessage);
    }

    this.logger.log(
      JSON.stringify({
        event: isScheduled ? 'bulk_sms_scheduled' : 'bulk_sms_queued',
        tenantId: currentUser.tenantId,
        createdByUserId: currentUser.id,
        totalRecipients: uniqueRecipients.length,
        duplicatesRemoved,
        templateId: dto.templateId ?? null,
        personalized: !!dto.templateId,
        tenantPriority: tenantUsage.messagePriority,
        queuePriority,
      }),
    );

    return {
      success: true,
      status: isScheduled ? MessageStatus.SCHEDULED : MessageStatus.QUEUED,
      totalRecipients: uniqueRecipients.length,
      queued: savedMessages.length,
      duplicatesRemoved,
      scheduledAt: isScheduled ? scheduledDate?.toISOString() : null,
      templateId: dto.templateId ?? null,
      personalized: !!dto.templateId,
      messageIds: savedMessages.map((message) => message.id),
    };
  }

  private async resolveBulkRecipients(
    dto: CreateBulkMessageDto,
    currentUser: CurrentUser,
  ) {
    const recipients: string[] = [];

    if (dto.recipients?.length) {
      recipients.push(...dto.recipients);
    }

    if (dto.contactIds?.length) {
      const contactWhere =
        currentUser.role === 'user'
          ? {
              id: In(dto.contactIds),
              tenantId: currentUser.tenantId,
              createdByUserId: currentUser.id,
              isActive: true,
            }
          : {
              id: In(dto.contactIds),
              tenantId: currentUser.tenantId,
              isActive: true,
            };

      const contacts = await this.contactsRepository.find({
        where: contactWhere,
      });

      recipients.push(...contacts.map((contact) => contact.phone));
    }

    if (dto.contactGroupId) {
      const group = await this.contactGroupsRepository.findOne({
        where: {
          id: dto.contactGroupId,
          tenantId: currentUser.tenantId,
        },
        relations: ['contacts'],
      });

      if (!group) {
        throw new NotFoundException('Contact group not found');
      }

      const groupContacts =
        currentUser.role === 'user'
          ? group.contacts.filter(
              (contact) =>
                contact.isActive && contact.createdByUserId === currentUser.id,
            )
          : group.contacts.filter((contact) => contact.isActive);

      recipients.push(...groupContacts.map((contact) => contact.phone));
    }

    return recipients.map((recipient) => recipient.trim()).filter(Boolean);
  }

  async cancelScheduledMessage(id: string, currentUser: CurrentUser) {
    this.assertNotSuperAdminMessageWrite(currentUser);

    const message = await this.findRawMessageForCurrentUser(id, currentUser);

    if (message.status !== MessageStatus.SCHEDULED) {
      throw new BadRequestException('Only scheduled messages can be cancelled');
    }

    if (message.scheduledJobId) {
      const job = await this.smsQueue.getJob(message.scheduledJobId);
      await job?.remove();
    }

    await this.smsRepository.update(message.id, {
      status: MessageStatus.CANCELLED,
    });

    return this.findOne(message.id, currentUser);
  }

  async updateScheduledMessage(
    id: string,
    dto: UpdateScheduledMessageDto,
    currentUser: CurrentUser,
  ) {
    this.assertNotSuperAdminMessageWrite(currentUser);

    const message = await this.findRawMessageForCurrentUser(id, currentUser);

    if (message.status !== MessageStatus.SCHEDULED) {
      throw new BadRequestException(
        'Only scheduled messages can be edited before execution',
      );
    }

    if (message.sentAt || message.deliveredAt) {
      throw new BadRequestException('This message has already been sent');
    }

    const nextRecipient = dto.recipient
      ? this.normalizePhone(dto.recipient)
      : message.recipient;

    const nextContent = dto.content?.trim() || message.content;

    const nextScheduledAt = dto.scheduledAt
      ? new Date(dto.scheduledAt)
      : message.scheduledAt;

    if (
      !nextScheduledAt ||
      Number.isNaN(nextScheduledAt.getTime()) ||
      nextScheduledAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException('Scheduled time must be in the future');
    }

    await this.tenantsService.assertCanSendMessages(message.tenantId, 1);

    if (message.scheduledJobId) {
      try {
        const oldJob = await this.smsQueue.getJob(message.scheduledJobId);

        if (oldJob) {
          await oldJob.remove();
        }
      } catch (error) {
        this.logger.warn(
          JSON.stringify({
            event: 'scheduled_sms_old_job_remove_failed',
            messageId: message.id,
            scheduledJobId: message.scheduledJobId,
            errorMessage:
              error instanceof Error
                ? error.message
                : 'Unknown job remove error',
          }),
        );
      }
    }

    const idempotencyKey = this.buildIdempotencyKey(
      message.tenantId,
      nextRecipient,
      nextContent,
      nextScheduledAt.toISOString(),
    );

    await this.smsRepository.update(message.id, {
      recipient: nextRecipient,
      content: nextContent,
      scheduledAt: nextScheduledAt,
      status: MessageStatus.SCHEDULED,
      idempotencyKey,
      errorMessage: null,
      failureType: null,
    });

    const queuePriority = getBullMqPriority('normal');

    const job = await this.smsQueue.add(
      SMS_JOB_SEND,
      {
        messageId: message.id,
        tenantId: message.tenantId,
        createdByUserId: message.createdByUserId ?? undefined,
        recipient: nextRecipient,
        content: nextContent,
        idempotencyKey,
      },
      {
        delay: Math.max(0, nextScheduledAt.getTime() - Date.now()),
        priority: queuePriority,
        attempts: SMS_MAX_RETRIES,
        backoff: {
          type: 'exponential',
          delay: SMS_RETRY_DELAY_MS,
        },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    );

    await this.smsRepository.update(message.id, {
      scheduledJobId: job.id?.toString(),
    });

    this.logger.log(
      JSON.stringify({
        event: 'scheduled_sms_updated',
        messageId: message.id,
        tenantId: message.tenantId,
        scheduledAt: nextScheduledAt.toISOString(),
        scheduledJobId: job.id?.toString(),
      }),
    );

    return this.findOne(message.id, currentUser);
  }

  async retryMessage(
    id: string,
    currentUser: CurrentUser,
    dto?: Partial<CreateMessageDto>,
  ) {
    if (currentUser.role === 'super_admin') {
      throw new ForbiddenException(
        'Super admin cannot retry company messages directly',
      );
    }

    const message = await this.findRawMessageForCurrentUser(id, currentUser);

    if (
      ![MessageStatus.FAILED, MessageStatus.DEAD_LETTER].includes(
        message.status,
      )
    ) {
      throw new BadRequestException(
        'Only failed or dead-letter messages can be retried',
      );
    }

    const recipient = this.normalizePhone(
      dto?.recipient?.trim() || message.recipient,
    );

    const content = dto?.content?.trim() || message.content;

    if (!recipient) {
      throw new BadRequestException('Recipient is required');
    }

    if (!content) {
      throw new BadRequestException('Message content is required');
    }

    const tenantUsage = await this.tenantsService.assertCanSendMessages(
      message.tenantId,
      1,
    );

    const queuePriority = getBullMqPriority(tenantUsage.messagePriority);

    const idempotencyKey = this.buildIdempotencyKey(
      message.tenantId,
      recipient,
      content,
      randomUUID(),
    );

    await this.smsRepository.update(id, {
      recipient,
      content,
      idempotencyKey,
      status: MessageStatus.QUEUED,
      errorMessage: null,
      providerStatus: null,
      providerErrorCode: null,
      failureType: null,
      deadLetteredAt: null,
      retryCount: 0,
      sentAt: null,
      deliveredAt: null,
    });

    this.logger.log(
      JSON.stringify({
        event: 'queue_sms_retry',
        messageId: message.id,
        recipient: this.maskRecipient(recipient),
        idempotencyKey,
        tenantPriority: tenantUsage.messagePriority,
        queuePriority,
      }),
    );

    const job = await this.smsQueue.add(
      SMS_JOB_SEND,
      {
        messageId: message.id,
        tenantId: message.tenantId,
        createdByUserId: message.createdByUserId,
        recipient,
        content,
        idempotencyKey,
      },
      {
        priority: queuePriority,
        attempts: SMS_MAX_RETRIES,
        backoff: {
          type: 'exponential',
          delay: SMS_RETRY_DELAY_MS,
        },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    );

    await this.smsRepository.update(message.id, {
      scheduledJobId: job.id?.toString(),
    });

    this.logger.log(`Message ${message.id} queued for retry`);

    return this.findOne(message.id, currentUser);
  }

  async findFailedMessages(
    query: QueryFailedMessagesDto,
    currentUser: CurrentUser,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();

    const qb = this.smsRepository.createQueryBuilder('message');

    if (currentUser.role !== 'super_admin') {
      qb.where('message.tenantId = :tenantId', {
        tenantId: currentUser.tenantId,
      });
    } else {
      qb.where('1 = 1');
    }

    qb.andWhere('message.status IN (:...statuses)', {
      statuses: query.status
        ? [query.status]
        : [MessageStatus.FAILED, MessageStatus.DEAD_LETTER],
    });

    if (currentUser.role === 'user') {
      qb.andWhere('message.createdByUserId = :userId', {
        userId: currentUser.id,
      });
    }

    if (search) {
      qb.andWhere(
        new Brackets((subQb) => {
          subQb.where('message.recipient ILIKE :search', {
            search: `%${search}%`,
          });

          if (currentUser.role !== 'super_admin') {
            subQb.orWhere('message.content ILIKE :search', {
              search: `%${search}%`,
            });
          }

          subQb
            .orWhere('message.errorMessage ILIKE :search', {
              search: `%${search}%`,
            })
            .orWhere('message.failureType ILIKE :search', {
              search: `%${search}%`,
            })
            .orWhere('message.providerMessageId ILIKE :search', {
              search: `%${search}%`,
            })
            .orWhere('message.providerStatus ILIKE :search', {
              search: `%${search}%`,
            })
            .orWhere('message.providerErrorCode ILIKE :search', {
              search: `%${search}%`,
            });
        }),
      );
    }

    qb.orderBy('message.updatedAt', 'DESC');
    qb.skip((page - 1) * limit);
    qb.take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data: this.sanitizeMessagesForUser(data, currentUser),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findDeadLetterMessages(
    query: QueryFailedMessagesDto,
    currentUser: CurrentUser,
  ) {
    return this.findFailedMessages(
      {
        ...query,
        status: MessageStatus.DEAD_LETTER,
      },
      currentUser,
    );
  }

  async findAll(query: QueryMessagesDto, currentUser: CurrentUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();

    const qb = this.smsRepository.createQueryBuilder('message');

    if (currentUser.role !== 'super_admin') {
      qb.where('message.tenantId = :tenantId', {
        tenantId: currentUser.tenantId,
      });
    } else {
      qb.where('1 = 1');
    }

    if (currentUser.role === 'user') {
      qb.andWhere('message.createdByUserId = :userId', {
        userId: currentUser.id,
      });
    }

    if (query.recipient) {
      qb.andWhere('message.recipient ILIKE :recipient', {
        recipient: `%${query.recipient}%`,
      });
    }

    if (query.status) {
      qb.andWhere('message.status = :status', {
        status: query.status,
      });
    }

    if (query.statuses) {
      const allowedStatuses = new Set(Object.values(MessageStatus));

      const statuses = query.statuses
        .split(',')
        .map((status) => status.trim())
        .filter((status): status is MessageStatus =>
          allowedStatuses.has(status as MessageStatus),
        );

      if (statuses.length > 0) {
        qb.andWhere('message.status IN (:...statuses)', {
          statuses,
        });
      }
    }

    if (search) {
      const searchTerms = [search];

      const compactSearch = search.replace(/\s+/g, '');

      if (compactSearch.startsWith('09') && compactSearch.length >= 2) {
        searchTerms.push(`+251${compactSearch.slice(1)}`);
        searchTerms.push(`251${compactSearch.slice(1)}`);
      }

      if (compactSearch.startsWith('9') && compactSearch.length >= 1) {
        searchTerms.push(`+251${compactSearch}`);
        searchTerms.push(`251${compactSearch}`);
      }

      if (compactSearch.startsWith('251')) {
        searchTerms.push(`+${compactSearch}`);
      }

      if (compactSearch.startsWith('+251')) {
        searchTerms.push(compactSearch.slice(1));
        searchTerms.push(`0${compactSearch.slice(4)}`);
      }

      if (currentUser.role === 'super_admin') {
        qb.andWhere(
          `(
            message.recipient ILIKE ANY(:searchTerms) OR
            message.providerMessageId ILIKE :search OR
            message.providerStatus ILIKE :search OR
            message.providerErrorCode ILIKE :search OR
            message.failureType ILIKE :search
          )`,
          {
            search: `%${search}%`,
            searchTerms: searchTerms.map((term) => `%${term}%`),
          },
        );
      } else {
        qb.andWhere(
          `(
            message.recipient ILIKE ANY(:searchTerms) OR
            message.content ILIKE :search OR
            message.providerMessageId ILIKE :search
          )`,
          {
            search: `%${search}%`,
            searchTerms: searchTerms.map((term) => `%${term}%`),
          },
        );
      }
    }

    qb.orderBy('message.createdAt', 'DESC');
    qb.skip((page - 1) * limit);
    qb.take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data: this.sanitizeMessagesForUser(data, currentUser),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, currentUser: CurrentUser) {
    const message = await this.findRawMessageForCurrentUser(id, currentUser);

    return this.sanitizeMessageForUser(message, currentUser);
  }

  async handleDeliveryReport(payload: {
    id?: string;
    messageId?: string;
    status?: string;
    failureReason?: string;
  }) {
    const providerMessageId = payload.messageId || payload.id;

    if (!providerMessageId) {
      this.logger.warn('Delivery report received without messageId');
      return;
    }

    return this.updateDeliveryStatusFromWebhook({
      providerMessageId,
      providerStatus: payload.status,
      deliveredAt: new Date(),
      errorMessage: payload.failureReason,
    });
  }

  async getStats(currentUser: CurrentUser) {
    const whereClause: FindOptionsWhere<SmsMessage> = {};

    if (currentUser.role !== 'super_admin') {
      whereClause.tenantId = currentUser.tenantId;
    }

    if (currentUser.role === 'user') {
      whereClause.createdByUserId = currentUser.id;
    }

    const [
      totalMessages,
      sentMessages,
      failedMessages,
      deadLetterMessages,
    ] = await Promise.all([
      this.smsRepository.count({
        where: whereClause,
      }),

      this.smsRepository.count({
        where: {
          ...whereClause,
          status: MessageStatus.SENT,
        },
      }),

      this.smsRepository.count({
        where: {
          ...whereClause,
          status: MessageStatus.FAILED,
        },
      }),

      this.smsRepository.count({
        where: {
          ...whereClause,
          status: MessageStatus.DEAD_LETTER,
        },
      }),
    ]);

    return {
      totalMessages,
      sentMessages,
      failedMessages,
      deadLetterMessages,
    };
  }

  async updateDeliveryStatusFromWebhook(input: {
    providerMessageId: string;
    providerStatus?: string;
    deliveredAt?: Date;
    errorMessage?: string;
    providerErrorCode?: string;
  }) {
    const message = await this.smsRepository.findOne({
      where: {
        providerMessageId: input.providerMessageId,
      },
    });

    if (!message) {
      throw new NotFoundException('Message not found for providerMessageId');
    }

    const rawStatus = (input.providerStatus || '').toLowerCase().trim();

    let nextStatus: MessageStatus | null = null;
    let failureType: string | null = message.failureType ?? null;

    const deliveredStatuses = [
      'delivered',
      'success',
      'successful',
      'completed',
    ];

    const sentStatuses = ['sent', 'submitted', 'accepted', 'queued'];

    const failedStatuses = [
      'failed',
      'failure',
      'rejected',
      'undelivered',
      'delivery_failed',
      'expired',
      'blocked',
      'bounced',
      'error',
    ];

    if (deliveredStatuses.includes(rawStatus)) {
      nextStatus = MessageStatus.DELIVERED;
    } else if (sentStatuses.includes(rawStatus)) {
      nextStatus = MessageStatus.SENT;
    } else if (failedStatuses.includes(rawStatus)) {
      nextStatus = MessageStatus.FAILED;
      failureType = rawStatus || 'provider_failure';
    }

    if (!nextStatus) {
      this.logger.warn(
        JSON.stringify({
          event: 'sms_delivery_webhook_ignored_unknown_status',
          providerMessageId: input.providerMessageId,
          providerStatus: input.providerStatus ?? null,
          messageId: message.id,
        }),
      );

      return message;
    }

    if (message.status === nextStatus) {
      return message;
    }

    const wasAlreadyFailed = [
      MessageStatus.FAILED,
      MessageStatus.DEAD_LETTER,
    ].includes(message.status);

    if (!this.canTransitionMessageStatus(message.status, nextStatus)) {
      this.logger.warn(
        JSON.stringify({
          event: 'sms_delivery_webhook_invalid_transition',
          providerMessageId: input.providerMessageId,
          messageId: message.id,
          currentStatus: message.status,
          nextStatus,
        }),
      );

      return message;
    }

    await this.smsRepository.update(message.id, {
      status: nextStatus,
      providerStatus: input.providerStatus ?? message.providerStatus,
      providerErrorCode: input.providerErrorCode ?? message.providerErrorCode,
      failureType:
        nextStatus === MessageStatus.FAILED
          ? failureType
          : message.failureType,
      deliveredAt:
        nextStatus === MessageStatus.DELIVERED
          ? input.deliveredAt || new Date()
          : message.deliveredAt,
      sentAt:
        nextStatus === MessageStatus.SENT && !message.sentAt
          ? new Date()
          : message.sentAt,
      errorMessage:
        nextStatus === MessageStatus.FAILED
          ? input.errorMessage ||
            message.errorMessage ||
            'Provider reported delivery failure'
          : message.errorMessage,
    });

    if (
      nextStatus === MessageStatus.FAILED &&
      !wasAlreadyFailed &&
      message.campaignId
    ) {
      await this.campaignsService.recordMessageFailure(message.campaignId);
    }

    this.logger.log(
      JSON.stringify({
        event: 'sms_delivery_webhook_status_updated',
        providerMessageId: input.providerMessageId,
        messageId: message.id,
        campaignId: message.campaignId ?? null,
        previousStatus: message.status,
        nextStatus,
        providerStatus: input.providerStatus ?? null,
      }),
    );

    return this.findOneByTenant(message.id, message.tenantId);
  }

  private isSuperAdmin(currentUser: CurrentUser) {
    return currentUser.role === 'super_admin';
  }

  private maskRecipient(recipient?: string | null) {
    if (!recipient) return 'Restricted';

    const value = recipient.trim();

    if (value.length <= 6) {
      return `${value.slice(0, 2)}****`;
    }

    return `${value.slice(0, 4)}****${value.slice(-3)}`;
  }

  private sanitizeMessageForUser(
    message: SmsMessage,
    currentUser: CurrentUser,
  ): SmsMessage | SafeSmsMessage {
    if (!this.isSuperAdmin(currentUser)) {
      return message;
    }

    const {
      recipient,
      content,
      createdByUserId,
      idempotencyKey,
      scheduledJobId,
      ...safeMessage
    } = message;

    return {
      ...safeMessage,
      recipient: this.maskRecipient(recipient),
      content: 'Restricted for privacy',
      isRestricted: true,
    };
  }

  private sanitizeMessagesForUser(
    messages: SmsMessage[],
    currentUser: CurrentUser,
  ): Array<SmsMessage | SafeSmsMessage> {
    return messages.map((message) =>
      this.sanitizeMessageForUser(message, currentUser),
    );
  }

  private async findRawMessageForCurrentUser(
    id: string,
    currentUser: CurrentUser,
  ) {
    const message = await this.smsRepository.findOne({
      where:
        currentUser.role === 'super_admin'
          ? { id }
          : {
              id,
              tenantId: currentUser.tenantId,
            },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (
      currentUser.role === 'user' &&
      message.createdByUserId !== currentUser.id
    ) {
      throw new ForbiddenException('You do not have access to this message');
    }

    return message;
  }

  private assertNotSuperAdminMessageWrite(currentUser: CurrentUser) {
    if (currentUser.role === 'super_admin') {
      throw new ForbiddenException(
        'Super admin cannot create or edit company messages',
      );
    }
  }

  private normalizePhone(phone: string) {
    const value = phone.trim().replace(/\s+/g, '');

    if (value.startsWith('+')) {
      return value;
    }

    if (value.startsWith('0')) {
      return `+251${value.slice(1)}`;
    }

    if (value.startsWith('251')) {
      return `+${value}`;
    }

    return value;
  }

  private buildIdempotencyKey(
    tenantId: string,
    recipient: string,
    content: string,
    nonce?: string,
  ) {
    return createHash('sha256')
      .update(`${tenantId}:${recipient}:${content}:${nonce ?? ''}`)
      .digest('hex');
  }

  private canTransitionMessageStatus(
    currentStatus: MessageStatus,
    nextStatus: MessageStatus,
  ) {
    const allowedTransitions: Record<MessageStatus, MessageStatus[]> = {
      [MessageStatus.PENDING]: [
        MessageStatus.QUEUED,
        MessageStatus.FAILED,
        MessageStatus.DEAD_LETTER,
      ],
      [MessageStatus.SCHEDULED]: [
        MessageStatus.PROCESSING,
        MessageStatus.FAILED,
        MessageStatus.DEAD_LETTER,
      ],
      [MessageStatus.QUEUED]: [
        MessageStatus.PROCESSING,
        MessageStatus.SENT,
        MessageStatus.FAILED,
        MessageStatus.DEAD_LETTER,
      ],
      [MessageStatus.PROCESSING]: [
        MessageStatus.SENT,
        MessageStatus.FAILED,
        MessageStatus.DEAD_LETTER,
      ],
      [MessageStatus.SENT]: [MessageStatus.DELIVERED, MessageStatus.FAILED],
      [MessageStatus.DELIVERED]: [],
      [MessageStatus.CANCELLED]: [],
      [MessageStatus.FAILED]: [
        MessageStatus.QUEUED,
        MessageStatus.DEAD_LETTER,
      ],
      [MessageStatus.DEAD_LETTER]: [MessageStatus.QUEUED],
    };

    return allowedTransitions[currentStatus]?.includes(nextStatus) ?? false;
  }

  private async findOneByTenant(id: string, tenantId: string) {
    const message = await this.smsRepository.findOne({
      where: {
        id,
        tenantId,
      },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    return message;
  }

  private async resolveBulkRecipientsWithContacts(
    dto: CreateBulkMessageDto,
    currentUser: CurrentUser,
  ) {
    const recipients: string[] = [];
    const contactMap = new Map<string, Contact>();

    if (dto.recipients?.length) {
      recipients.push(...dto.recipients);
    }

    if (dto.contactIds?.length) {
      const contactWhere =
        currentUser.role === 'user'
          ? {
              id: In(dto.contactIds),
              tenantId: currentUser.tenantId,
              createdByUserId: currentUser.id,
              isActive: true,
            }
          : {
              id: In(dto.contactIds),
              tenantId: currentUser.tenantId,
              isActive: true,
            };

      const contacts = await this.contactsRepository.find({
        where: contactWhere,
      });

      for (const contact of contacts) {
        const normalizedPhone = this.normalizePhone(contact.phone);
        recipients.push(contact.phone);
        contactMap.set(normalizedPhone, contact);
      }
    }

    if (dto.contactGroupId) {
      const group = await this.contactGroupsRepository.findOne({
        where: {
          id: dto.contactGroupId,
          tenantId: currentUser.tenantId,
        },
        relations: ['contacts'],
      });

      if (!group) {
        throw new NotFoundException('Contact group not found');
      }

      const groupContacts =
        currentUser.role === 'user'
          ? group.contacts.filter(
              (contact) =>
                contact.isActive && contact.createdByUserId === currentUser.id,
            )
          : group.contacts.filter((contact) => contact.isActive);

      for (const contact of groupContacts) {
        const normalizedPhone = this.normalizePhone(contact.phone);
        recipients.push(contact.phone);
        contactMap.set(normalizedPhone, contact);
      }
    }

    return {
      recipients: recipients.map((recipient) => recipient.trim()).filter(Boolean),
      contactMap,
    };
  }
}
