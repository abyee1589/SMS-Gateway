import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './entities/tenant.entity';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { SubscriptionPlan } from '../subscription-plans/entities/subscription-plan.entity';
import { QuotaTransaction } from './entities/quota-transaction.entity';
import { TenantStatusHistory } from './entities/tenant-status-history.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, SubscriptionPlan, QuotaTransaction, TenantStatusHistory])],
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}