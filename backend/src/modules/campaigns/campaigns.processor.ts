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

type CampaignJobData = {
  campaignId: string;
  tenantId: string;
  userId: string;
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
  userId,
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

    await this.campaignsRepository.update(campaignId, {
      status: CampaignStatus.PROCESSING,
    });

    const contacts = await this.contactsRepository.find({
      where: {
        id: In(contactIds),
        tenantId,
      },
    });

    let sentCount = 0;
    let failedCount = 0;

    for (const contact of contacts) {
      try {
        await this.smsService.createMessage(
          {
            recipient: contact.phone,
            content: message,
          },
          {
            id: userId,
            tenantId,
            role: userRole,
          }
        );
        sentCount += 1;
      } catch (error) {
        failedCount += 1;
        this.logger.error(
          `Failed to create SMS for contact ${contact.id} in campaign ${campaignId}`,
        );
      }
    }

    const finalStatus =
      sentCount > 0 ? CampaignStatus.COMPLETED : CampaignStatus.FAILED;

    await this.campaignsRepository.update(campaignId, {
      sentCount,
      failedCount,
      status: finalStatus,
    });

    this.logger.log(`Campaign ${campaignId} processed`);
  }
}