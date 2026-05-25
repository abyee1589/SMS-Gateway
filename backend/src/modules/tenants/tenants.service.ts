import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant, SubscriptionStatus } from './entities/tenant.entity';
import { SubscriptionPlan } from '../subscription-plans/entities/subscription-plan.entity';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantsRepository: Repository<Tenant>,

    @InjectRepository(SubscriptionPlan)
    private readonly plansRepository: Repository<SubscriptionPlan>,
  ) {}

  async create(name: string) {
    const tenant = this.tenantsRepository.create({
      name,
      smsQuota: 1000,
      smsUsed: 0,
      subscriptionStatus: SubscriptionStatus.ACTIVE,
    });

    return this.tenantsRepository.save(tenant);
  }

  async findById(id: string) {
    const tenant = await this.tenantsRepository.findOne({
      where: { id },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return tenant;
  }

  async getUsageStats(tenantId: string) {
    const tenant = await this.findById(tenantId);

    return {
      smsQuota: tenant.smsQuota,
      smsUsed: tenant.smsUsed,
      remainingSms: Math.max(0, tenant.smsQuota - tenant.smsUsed),
      subscriptionStatus: tenant.subscriptionStatus,
      subscriptionEndDate: tenant.subscriptionEndDate,
    };
  }

  async assertCanSendMessages(tenantId: string, count: number) {
    const tenant = await this.findById(tenantId);

    if (tenant.subscriptionStatus !== SubscriptionStatus.ACTIVE) {
      throw new Error('Subscription is not active');
    }

    if (tenant.subscriptionEndDate && tenant.subscriptionEndDate < new Date()) {
      throw new Error('Subscription has expired');
    }

    const remaining = tenant.smsQuota - tenant.smsUsed;

    if (remaining < count) {
      throw new Error(
        `SMS quota exceeded. Remaining: ${remaining}, requested: ${count}`,
      );
    }

    return {
      smsQuota: tenant.smsQuota,
      smsUsed: tenant.smsUsed,
      remainingSms: remaining,
    };
  }

  async incrementSmsUsage(tenantId: string, count: number) {
    await this.tenantsRepository.increment({ id: tenantId }, 'smsUsed', count);

    return this.getUsageStats(tenantId);
  }

  async assignPlan(tenantId: string, planId: string) {
    const tenant = await this.findById(tenantId);

    const plan = await this.plansRepository.findOne({
      where: { id: planId },
    });

    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    tenant.subscriptionPlanId = plan.id;
    tenant.smsQuota = plan.smsQuota;
    tenant.smsUsed = 0;
    tenant.subscriptionStartDate = new Date();

    const end = new Date();
    end.setDate(end.getDate() + plan.durationDays);
    tenant.subscriptionEndDate = end;

    tenant.subscriptionStatus = SubscriptionStatus.ACTIVE;

    return this.tenantsRepository.save(tenant);
  }
}