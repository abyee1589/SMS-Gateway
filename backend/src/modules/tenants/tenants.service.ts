import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Tenant,
  SubscriptionStatus,
  TenantStatus,
  CommercialTier,
  MessagePriority,
} from './entities/tenant.entity';
import {
  SubscriptionPlan,
  SubscriptionPlanStatus,
} from '../subscription-plans/entities/subscription-plan.entity';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import {
  QuotaTransaction,
  QuotaTransactionType,
} from './entities/quota-transaction.entity';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantsRepository: Repository<Tenant>,

    @InjectRepository(SubscriptionPlan)
    private readonly plansRepository: Repository<SubscriptionPlan>,

    @InjectRepository(QuotaTransaction)
    private readonly quotaTransactionsRepository: Repository<QuotaTransaction>,
  ) {}

  async create(nameOrDto: string | CreateTenantDto) {
    const dto =
      typeof nameOrDto === 'string'
        ? {
            name: nameOrDto,
          }
        : nameOrDto;

    const tenant = this.tenantsRepository.create({
      name: dto.name.trim(),
      legalName: dto.legalName?.trim() || undefined,
      tinNumber: dto.tinNumber?.trim() || undefined,
      contactEmail: dto.contactEmail?.trim().toLowerCase() || undefined,
      contactPhone: dto.contactPhone?.trim() || undefined,
      status: dto.status ?? TenantStatus.ACTIVE,
      commercialTier: dto.commercialTier ?? CommercialTier.STANDARD,
      discountPercent: dto.discountPercent ?? 0,
      messagePriority: dto.messagePriority ?? MessagePriority.NORMAL,
      smsQuota: dto.smsQuota ?? 1000,
      smsUsed: 0,
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      notes: dto.notes?.trim() || undefined,
    });

    return this.tenantsRepository.save(tenant);
  }

  async findAll() {
    return this.tenantsRepository.find({
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findById(id: string) {
    const tenant = await this.tenantsRepository.findOne({
      where: {
        id,
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return tenant;
  }

  async update(id: string, dto: UpdateTenantDto) {
    const tenant = await this.findById(id);

    if (dto.name !== undefined) tenant.name = dto.name.trim();

    if (dto.legalName !== undefined) {
      tenant.legalName = dto.legalName.trim() || undefined;
    }

    if (dto.tinNumber !== undefined) {
      tenant.tinNumber = dto.tinNumber.trim() || undefined;
    }

    if (dto.contactEmail !== undefined) {
      tenant.contactEmail = dto.contactEmail.trim().toLowerCase() || undefined;
    }

    if (dto.contactPhone !== undefined) {
      tenant.contactPhone = dto.contactPhone.trim() || undefined;
    }

    if (dto.status !== undefined) tenant.status = dto.status;

    if (dto.commercialTier !== undefined) {
      tenant.commercialTier = dto.commercialTier;
    }

    if (dto.discountPercent !== undefined) {
      tenant.discountPercent = dto.discountPercent;
    }

    if (dto.messagePriority !== undefined) {
      tenant.messagePriority = dto.messagePriority;
    }

    if (dto.notes !== undefined) {
      tenant.notes = dto.notes.trim() || undefined;
    }

    return this.tenantsRepository.save(tenant);
  }

  async getUsageStats(tenantId: string) {
    const tenant = await this.findById(tenantId);

    return {
      smsQuota: tenant.smsQuota,
      smsUsed: tenant.smsUsed,
      remainingSms: Math.max(0, tenant.smsQuota - tenant.smsUsed),
      usagePercent:
        tenant.smsQuota > 0
          ? Number(((tenant.smsUsed / tenant.smsQuota) * 100).toFixed(1))
          : 0,
      tenantStatus: tenant.status,
      commercialTier: tenant.commercialTier,
      messagePriority: tenant.messagePriority,
      subscriptionStatus: tenant.subscriptionStatus,
      subscriptionEndDate: tenant.subscriptionEndDate,
    };
  }

  async assertCanSendMessages(tenantId: string, count: number) {
    const tenant = await this.findById(tenantId);

    if (
      tenant.status !== TenantStatus.ACTIVE &&
      tenant.status !== TenantStatus.TRIAL
    ) {
      throw new BadRequestException(`Tenant is ${tenant.status}`);
    }

    if (tenant.subscriptionStatus !== SubscriptionStatus.ACTIVE) {
      throw new BadRequestException('Subscription is not active');
    }

    if (tenant.subscriptionEndDate && tenant.subscriptionEndDate < new Date()) {
      tenant.status = TenantStatus.EXPIRED;
      tenant.subscriptionStatus = SubscriptionStatus.EXPIRED;

      await this.tenantsRepository.save(tenant);

      throw new BadRequestException('Subscription has expired');
    }

    const remaining = tenant.smsQuota - tenant.smsUsed;

    if (remaining < count) {
      throw new BadRequestException(
        `SMS quota exceeded. Remaining: ${remaining}, requested: ${count}`,
      );
    }

    return {
      smsQuota: tenant.smsQuota,
      smsUsed: tenant.smsUsed,
      remainingSms: remaining,
      messagePriority: tenant.messagePriority,
    };
  }

  async incrementSmsUsage(
    tenantId: string,
    count: number,
    referenceId?: string,
    actorUserId?: string,
  ) {
    const tenant = await this.findById(tenantId);

    const balanceBefore = tenant.smsQuota - tenant.smsUsed;

    tenant.smsUsed += count;

    const savedTenant = await this.tenantsRepository.save(tenant);

    const balanceAfter = savedTenant.smsQuota - savedTenant.smsUsed;

    const transaction = this.quotaTransactionsRepository.create({
      tenantId,
      type: QuotaTransactionType.USAGE,
      amount: -count,
      balanceBefore,
      balanceAfter,
      reason: 'SMS usage',
      referenceId,
      createdByUserId: actorUserId,
    });

    await this.quotaTransactionsRepository.save(transaction);

    return this.getUsageStats(tenantId);
  }

  async addQuota(
    tenantId: string,
    amount: number,
    actorUserId?: string,
    reason = 'Manual quota allocation',
  ) {
    if (amount <= 0) {
      throw new BadRequestException('Quota amount must be greater than zero');
    }

    const tenant = await this.findById(tenantId);

    const balanceBefore = tenant.smsQuota - tenant.smsUsed;

    tenant.smsQuota += amount;

    const savedTenant = await this.tenantsRepository.save(tenant);

    const balanceAfter = savedTenant.smsQuota - savedTenant.smsUsed;

    const transaction = this.quotaTransactionsRepository.create({
      tenantId,
      type: QuotaTransactionType.ALLOCATION,
      amount,
      balanceBefore,
      balanceAfter,
      reason,
      createdByUserId: actorUserId,
    });

    await this.quotaTransactionsRepository.save(transaction);

    return savedTenant;
  }

  async getQuotaTransactions(tenantId: string) {
    await this.findById(tenantId);

    return this.quotaTransactionsRepository.find({
      where: {
        tenantId,
      },
      order: {
        createdAt: 'DESC',
      },
      take: 100,
    });
  }

  async assignPlan(tenantId: string, planId: string, actorUserId?: string) {
    const tenant = await this.findById(tenantId);

    const plan = await this.plansRepository.findOne({
      where: {
        id: planId,
      },
    });

    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    if (plan.status !== SubscriptionPlanStatus.ACTIVE) {
      throw new BadRequestException('Cannot assign an inactive subscription plan');
    }

    const balanceBefore = tenant.smsQuota - tenant.smsUsed;

    tenant.subscriptionPlanId = plan.id;
    tenant.smsQuota = plan.smsQuota;
    tenant.smsUsed = 0;
    tenant.subscriptionStartDate = new Date();

    const end = new Date();
    end.setDate(end.getDate() + plan.durationDays);

    tenant.subscriptionEndDate = end;
    tenant.status = TenantStatus.ACTIVE;
    tenant.subscriptionStatus = SubscriptionStatus.ACTIVE;

    const savedTenant = await this.tenantsRepository.save(tenant);

    const balanceAfter = savedTenant.smsQuota - savedTenant.smsUsed;

    const transaction = this.quotaTransactionsRepository.create({
      tenantId,
      type: QuotaTransactionType.ALLOCATION,
      amount: balanceAfter - balanceBefore,
      balanceBefore,
      balanceAfter,
      reason: `Subscription plan assigned: ${plan.name}`,
      referenceId: plan.id,
      createdByUserId: actorUserId,
    });

    await this.quotaTransactionsRepository.save(transaction);

    return savedTenant;
  }
}