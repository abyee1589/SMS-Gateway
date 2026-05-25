import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './entities/tenant.entity';
import { TenantsService } from './tenants.service';
import { SmsMessage } from '../sms/entities/sms.entity';
import { SubscriptionPlan } from '../subscription-plans/entities/subscription-plan.entity'

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, SmsMessage, SubscriptionPlan])],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}