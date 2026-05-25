import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHash, randomUUID } from 'crypto';
import { SmsMessage, MessageStatus } from './entities/sms.entity';
import { CreateMessageDto } from './dto/create-message.dto';
import { QueryMessagesDto } from './dto/query-messages.dto';
import {
  SMS_JOB_SEND,
  SMS_QUEUE,
  SMS_MAX_RETRIES,
  SMS_RETRY_DELAY_MS,
} from './constants/sms.constants';
import { TenantsService } from '../tenants/tenants.service';


type CurrentUser = {
  id: string;
  tenantId: string;
  role: string;
};

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(
    @InjectRepository(SmsMessage)
    private readonly smsRepository: Repository<SmsMessage>,

    @InjectQueue(SMS_QUEUE)
    private readonly smsQueue: Queue,

    private readonly tenantsService: TenantsService,
  ) {}

  async createMessage(
  dto: CreateMessageDto & { forceSend?: boolean },
  currentUser: CurrentUser,
) {
  const recipient = this.normalizePhone(dto.recipient);
  const content = dto.content.trim();
  const forceSend = dto.forceSend === true;

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
      return existing;
    }
  }

  await this.tenantsService.assertCanSendMessages(currentUser.tenantId, 1);

  const message = this.smsRepository.create({
    recipient,
    content,
    tenantId: currentUser.tenantId,
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
    }),
  );

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
      delay: isScheduled ? Math.max(0, scheduledDate!.getTime() - Date.now()) : 0,
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
  
  async cancelScheduledMessage(id: string, currentUser: CurrentUser) {
    const message = await this.findOne(id, currentUser);

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

  async retryMessage(
    id: string,
    currentUser: CurrentUser,
    dto?: Partial<CreateMessageDto>,
  ) {
    const message = await this.findOne(id, currentUser);

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

    await this.tenantsService.assertCanSendMessages(message.tenantId, 1);

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
    recipient,
    content,
    idempotencyKey,
  }),
);

    await this.smsQueue.add(
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
        attempts: SMS_MAX_RETRIES,
        backoff: {
          type: 'exponential',
          delay: SMS_RETRY_DELAY_MS,
        },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    );

    this.logger.log(`Message ${message.id} queued for retry`);

    return this.findOne(message.id, currentUser);
  }

  async findAll(query: QueryMessagesDto, currentUser: CurrentUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.smsRepository.createQueryBuilder('message');

    qb.where('message.tenantId = :tenantId', {
      tenantId: currentUser.tenantId,
    });

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

    qb.orderBy('message.createdAt', 'DESC');
    qb.skip((page - 1) * limit);
    qb.take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, currentUser: CurrentUser) {
    const message = await this.smsRepository.findOne({
      where: {
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
    const whereClause: FindOptionsWhere<SmsMessage> = {
      tenantId: currentUser.tenantId,
    };

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

    if (['delivered', 'success', 'successful', 'sent'].includes(rawStatus)) {
      nextStatus = MessageStatus.DELIVERED;
    } else if (
      ['failed', 'rejected', 'undelivered', 'delivery_failed'].includes(
        rawStatus,
      )
    ) {
      nextStatus = MessageStatus.FAILED;
    }

    if (!nextStatus) {
      return message;
    }

    if (message.status === nextStatus) {
      return message;
    }

    if (!this.canTransitionMessageStatus(message.status, nextStatus)) {
      return message;
    }

    await this.smsRepository.update(message.id, {
      status: nextStatus,
      providerStatus: input.providerStatus ?? message.providerStatus,
      deliveredAt:
        nextStatus === MessageStatus.DELIVERED
          ? input.deliveredAt || new Date()
          : message.deliveredAt,
      errorMessage:
        nextStatus === MessageStatus.FAILED
          ? input.errorMessage || message.errorMessage
          : message.errorMessage,
    });

    return this.findOneByTenant(message.id, message.tenantId);
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
      [MessageStatus.PENDING]: [MessageStatus.QUEUED, MessageStatus.FAILED],
      [MessageStatus.SCHEDULED]: [MessageStatus.PROCESSING, MessageStatus.FAILED],
      [MessageStatus.QUEUED]: [MessageStatus.PROCESSING, MessageStatus.FAILED],
      [MessageStatus.PROCESSING]: [MessageStatus.SENT, MessageStatus.FAILED],
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
}