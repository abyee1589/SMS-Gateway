import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { Campaign } from './entities/campaign.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { SmsModule } from '../sms/sms.module';
import { TenantsModule } from '../tenants/tenants.module';
import { CampaignsProcessor } from './campaigns.processor';
import { CAMPAIGN_QUEUE } from './constants/campaign.constants';
import { ContactGroup } from '../contacts/entities/contact-group.entity';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MessageTemplatesModule } from '../message-templates/message-templates.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Campaign, Contact, ContactGroup]),
    BullModule.registerQueue({
      name: CAMPAIGN_QUEUE,
    }),
    forwardRef(() => SmsModule),
    TenantsModule,
    AuditLogsModule,
    NotificationsModule,
    MessageTemplatesModule,
  ],
  controllers: [CampaignsController],
  providers: [CampaignsService, CampaignsProcessor],
  exports: [CampaignsService],
})
export class CampaignsModule {}