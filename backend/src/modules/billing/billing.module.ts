import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailModule } from '../mail/mail.module';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import { BillingNotificationsService } from './billing-notifications.service';
import { BillingNotificationLog } from './entities/billing-notification-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, User, BillingNotificationLog]),
    MailModule,
  ],
  providers: [BillingNotificationsService],
  exports: [BillingNotificationsService],
})
export class BillingModule {}
