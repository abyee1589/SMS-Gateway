import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Logger } from '@nestjs/common';
import { Campaign, CampaignStatus } from './entities/campaign.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { SmsService } from '../sms/sms.service';
import {
  CAMPAIGN_JOB_PROCESS,
  CAMPAIGN_QUEUE,
} from './constants/campaign.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { MessageTemplatesService } from '../message-templates/message-templates.service';

type CampaignJobData = {
  campaignId: string;
  tenantId: string;
  createdByUserId: string;
  userRole: string;
  contactIds: string[];
  message: string;
};

@Processor(CAMPAIGN_QUEUE)
export class CampaignsProcessor extends WorkerHost {
  private readonly logger = new Logger(CampaignsProcessor.name);

  constructor(
    @InjectRepository(Campaign)
    private readonly campaignsRepository: Repository<Campaign>,

    @InjectRepository(Contact)
    private readonly contactsRepository: Repository<Contact>,

    private readonly smsService: SmsService,

    private readonly notificationsService: NotificationsService,

    private readonly messageTemplatesService: MessageTemplatesService,
  ) {
    super();
  }

  async process(job: Job<CampaignJobData>) {
    if (job.name !== CAMPAIGN_JOB_PROCESS) {
      return;
    }

    const {
      campaignId,
      tenantId,
      createdByUserId,
      userRole,
      contactIds,
      message,
    } = job.data;

    const campaign = await this.campaignsRepository.findOne({
      where: { id: campaignId, tenantId },
    });

    if (!campaign) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    if (
      campaign.status === CampaignStatus.COMPLETED ||
      campaign.status === CampaignStatus.FAILED
    ) {
      this.logger.warn(
        JSON.stringify({
          event: 'campaign_job_skipped_already_final',
          campaignId,
          tenantId,
          status: campaign.status,
        }),
      );

      return {
        success: true,
        campaignId,
        skipped: true,
        reason: 'already_final',
      };
    }

    await this.campaignsRepository.update(campaignId, {
      status: CampaignStatus.PROCESSING,
      sentCount: 0,
      failedCount: 0,
    });

    const contacts = await this.contactsRepository.find({
      where: {
        id: In(contactIds),
        tenantId,
        ...(userRole === 'user' ? { createdByUserId } : {}),
      },
    });

    let sentCount = 0;
    let failedCount = 0;

    for (const contact of contacts) {
      try {
        const personalizedMessage = this.messageTemplatesService.renderTemplate(
          message,
          contact,
        );

        await this.smsService.createMessage(
          {
            recipient: contact.phone,
            content: personalizedMessage,
            campaignId,
          },
          {
            id: createdByUserId,
            tenantId,
            role: userRole,
          },
        );

        sentCount += 1;

        await this.campaignsRepository.update(campaignId, {
          sentCount,
          failedCount,
        });
      } catch (error) {
        failedCount += 1;

        await this.campaignsRepository.update(campaignId, {
          sentCount,
          failedCount,
        });

        this.logger.error(
          JSON.stringify({
            event: 'campaign_sms_create_failed',
            campaignId,
            tenantId,
            contactId: contact.id,
            errorMessage:
              error instanceof Error ? error.message : 'Unknown campaign error',
          }),
        );
      }
    }

    const missingContactCount = Math.max(0, contactIds.length - contacts.length);

    if (missingContactCount > 0) {
      failedCount += missingContactCount;
    }

    const finalStatus =
      sentCount > 0 && failedCount === 0
        ? CampaignStatus.COMPLETED
        : sentCount > 0
          ? CampaignStatus.COMPLETED
          : CampaignStatus.FAILED;

    await this.campaignsRepository.update(campaignId, {
      sentCount,
      failedCount,
      status: finalStatus,
    });

    await this.notifyFailedCampaign({
      campaign,
      failedCount,
      sentCount,
      totalRecipients: contactIds.length,
    });

    this.logger.log(
      JSON.stringify({
        event: 'campaign_processed',
        campaignId,
        tenantId,
        sentCount,
        failedCount,
        totalRecipients: contactIds.length,
        finalStatus,
      }),
    );

    this.logger.log(
      JSON.stringify({
        event: 'campaign_processed',
        campaignId,
        tenantId,
        sentCount,
        failedCount,
        totalRecipients: campaign.totalRecipients,
        finalStatus,
      }),
    );

    return {
      success: finalStatus === CampaignStatus.COMPLETED,
      campaignId,
      sentCount,
      failedCount,
      finalStatus,
    };
  }
  private async notifyFailedCampaign({
    campaign,
    failedCount,
    sentCount,
    totalRecipients,
  }: {
    campaign: Campaign;
    failedCount: number;
    sentCount: number;
    totalRecipients: number;
  }) {
    if (failedCount <= 0) {
      return;
    }

    const campaignName = campaign.name || 'Untitled campaign';

    const title =
      sentCount > 0
        ? 'Campaign completed with failed recipients'
        : 'Campaign failed';

    const message =
      sentCount > 0
        ? `Campaign "${campaignName}" completed, but ${failedCount} of ${totalRecipients} recipient(s) failed.`
        : `Campaign "${campaignName}" failed for all ${totalRecipients} recipient(s).`;

    await this.notificationsService.createOnce({
      tenantId: campaign.tenantId,
      userId: campaign.createdByUserId ?? null,
      type: NotificationType.FAILED_CAMPAIGN,
      title,
      message,
      actionUrl: '/campaigns',
      dedupeKey: `${campaign.id}:failed-campaign:${failedCount}:${sentCount}:${totalRecipients}`,
      metadata: {
        campaignId: campaign.id,
        campaignName,
        failedCount,
        sentCount,
        totalRecipients,
      },
    });
  }
}