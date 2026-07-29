import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import { Campaign, CampaignStatus } from './entities/campaign.entity';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { QueryCampaignsDto } from './dto/query-campaigns.dto';
import { Contact } from '../contacts/entities/contact.entity';
import { ContactGroup } from '../contacts/entities/contact-group.entity';
import { TenantsService } from '../tenants/tenants.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { MessageTemplatesService } from '../message-templates/message-templates.service';
import {
  CAMPAIGN_JOB_PROCESS,
  CAMPAIGN_QUEUE,
} from './constants/campaign.constants';

type CurrentUser = {
  id: string;
  tenantId: string;
  role: string;
};

@Injectable()
export class CampaignsService {
  constructor(
    @InjectRepository(Campaign)
    private readonly campaignsRepository: Repository<Campaign>,

    @InjectRepository(Contact)
    private readonly contactsRepository: Repository<Contact>,

    @InjectRepository(ContactGroup)
    private readonly groupsRepository: Repository<ContactGroup>,

    @InjectQueue(CAMPAIGN_QUEUE)
    private readonly campaignQueue: Queue,

    private readonly tenantsService: TenantsService,

    private readonly notificationsService: NotificationsService,

    private readonly messageTemplatesService: MessageTemplatesService,
  ) {}

  async create(dto: CreateCampaignDto, currentUser: CurrentUser) {
    let campaignMessage = dto.message.trim();

    if (dto.templateId) {
      const template = await this.messageTemplatesService.findOne(
        dto.templateId,
        currentUser,
      );

      if (!template.isActive) {
        throw new ForbiddenException('Message template is inactive');
      }

      campaignMessage = template.content.trim();
    }

    const directContacts = dto.contactIds?.length
      ? await this.contactsRepository.find({
          where: {
            id: In(dto.contactIds),
            tenantId: currentUser.tenantId,
            ...(currentUser.role === 'user'
              ? { createdByUserId: currentUser.id }
              : {}),
          },
        })
      : [];

    const groups = dto.groupIds?.length
      ? await this.groupsRepository.find({
          where: {
            id: In(dto.groupIds),
            tenantId: currentUser.tenantId,
            ...(currentUser.role === 'user'
              ? { createdByUserId: currentUser.id }
              : {}),
          },
          relations: ['contacts'],
        })
      : [];

    const groupContacts = groups.flatMap((group) => group.contacts || []);

    const mergedMap = new Map<string, Contact>();

    for (const contact of [...directContacts, ...groupContacts]) {
      if (contact.tenantId !== currentUser.tenantId) {
        continue;
      }

      if (
        currentUser.role === 'user' &&
        contact.createdByUserId !== currentUser.id
      ) {
        continue;
      }

      mergedMap.set(contact.id, contact);
    }

    const contacts = Array.from(mergedMap.values());

    if (!contacts.length) {
      throw new NotFoundException(
        'No valid contacts found from selected contacts or groups',
      );
    }

    try {
      await this.tenantsService.assertCanSendMessages(
        currentUser.tenantId,
        contacts.length,
      );
    } catch (error) {
      throw new ForbiddenException(
        error instanceof Error ? error.message : 'Quota exceeded',
      );
    }

    const scheduledDate = dto.scheduledAt
      ? new Date(dto.scheduledAt)
      : undefined;

    const isScheduled = !!(
      scheduledDate &&
      !Number.isNaN(scheduledDate.getTime()) &&
      scheduledDate.getTime() > Date.now()
    );

    const campaign = this.campaignsRepository.create({
      tenantId: currentUser.tenantId,
      createdByUserId: currentUser.id,
      name: dto.name.trim(),
      message: campaignMessage,
      status: isScheduled
        ? CampaignStatus.SCHEDULED
        : CampaignStatus.PROCESSING,
      totalRecipients: contacts.length,
      sentCount: 0,
      failedCount: 0,
      scheduledAt: isScheduled ? scheduledDate : undefined,
    });

    const savedCampaign = await this.campaignsRepository.save(campaign);

    const delay = isScheduled
      ? Math.max(0, scheduledDate!.getTime() - Date.now())
      : 0;

    await this.campaignQueue.add(
      CAMPAIGN_JOB_PROCESS,
      {
        campaignId: savedCampaign.id,
        tenantId: currentUser.tenantId,
        createdByUserId: currentUser.id,
        userRole: currentUser.role,
        contactIds: contacts.map((contact) => contact.id),
        message: campaignMessage,
      },
      {
        delay,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    );

    return this.findOne(savedCampaign.id, currentUser);
  }

  async findAll(query: QueryCampaignsDto, currentUser: CurrentUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.campaignsRepository.createQueryBuilder('campaign');

    qb.where('campaign.tenantId = :tenantId', {
      tenantId: currentUser.tenantId,
    });

    if (currentUser.role === 'user') {
      qb.andWhere('campaign.createdByUserId = :userId', {
        userId: currentUser.id,
      });
    }

    if (query.search) {
      qb.andWhere(
        new Brackets((subQb) => {
          subQb
            .where('campaign.name ILIKE :search', {
              search: `%${query.search}%`,
            })
            .orWhere('campaign.message ILIKE :search', {
              search: `%${query.search}%`,
            });
        }),
      );
    }

    qb.orderBy('campaign.createdAt', 'DESC');
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
    const campaign = await this.campaignsRepository.findOne({
      where: {
        id,
        tenantId: currentUser.tenantId,
      },
    });

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    if (
      currentUser.role === 'user' &&
      campaign.createdByUserId !== currentUser.id
    ) {
      throw new ForbiddenException('You can only access your own campaigns');
    }

    return campaign;
  }

  async assertCanManageCampaign(id: string, currentUser: CurrentUser) {
    const campaign = await this.findOne(id, currentUser);

    if (
      currentUser.role === 'user' &&
      campaign.createdByUserId !== currentUser.id
    ) {
      throw new ForbiddenException('You can only manage your own campaigns');
    }

    return campaign;
  }

  async recordMessageFailure(campaignId: string) {
    const campaign = await this.campaignsRepository.findOne({
      where: {
        id: campaignId,
      },
    });

    if (!campaign) {
      return;
    }

    const failedCount = Number(campaign.failedCount || 0) + 1;
    const sentCount = Number(campaign.sentCount || 0);

    await this.campaignsRepository.update(campaign.id, {
      failedCount,
      status: sentCount > 0 ? CampaignStatus.COMPLETED : CampaignStatus.FAILED,
    });

    await this.notificationsService.createOnce({
      tenantId: campaign.tenantId,
      userId: campaign.createdByUserId ?? null,
      type: NotificationType.FAILED_CAMPAIGN,
      title:
        sentCount > 0
          ? 'Campaign completed with failed recipients'
          : 'Campaign failed',
      message:
        sentCount > 0
          ? `Campaign "${campaign.name}" has failed recipient(s). Failed count: ${failedCount}.`
          : `Campaign "${campaign.name}" has failed recipient(s). Failed count: ${failedCount}.`,
      actionUrl: '/campaigns',
      dedupeKey: `${campaign.id}:message-failure:${failedCount}`,
      metadata: {
        campaignId: campaign.id,
        campaignName: campaign.name,
        failedCount,
        sentCount: campaign.sentCount,
        totalRecipients: campaign.totalRecipients,
      },
    });
  }
}