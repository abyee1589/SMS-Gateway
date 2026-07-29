import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { SmsMessage, MessageStatus } from '../sms/entities/sms.entity';
import {
  CommercialTier,
  Tenant,
  TenantStatus,
} from '../tenants/entities/tenant.entity';

type CurrentUser = {
  id: string;
  tenantId: string;
  role: string;
};

type DashboardPeriod = 'today' | 'week' | 'month' | 'year';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,

    @InjectRepository(SmsMessage)
    private readonly messagesRepository: Repository<SmsMessage>,

    @InjectRepository(Tenant)
    private readonly tenantsRepository: Repository<Tenant>,
  ) {}

  async getStats(
    currentUser: CurrentUser,
    period: DashboardPeriod = 'month',
    selectedTenantId?: string,
  ) {
    const dateRange = this.getDateRange(period);

    /**
     * Super admin behavior:
     * - No selectedTenantId => platform-wide dashboard
     * - selectedTenantId => selected company dashboard
     */
    if (currentUser.role === 'super_admin') {
      if (selectedTenantId) {
        return this.getSelectedCompanyStats(
          currentUser,
          selectedTenantId,
          period,
          dateRange,
        );
      }

      return this.getPlatformStats(currentUser, period, dateRange);
    }

    /**
     * Normal admin/user behavior:
     * Always scoped to their own company.
     */
    return this.getTenantStats(currentUser, period, dateRange);
  }

  private getDateRange(period: DashboardPeriod) {
    const now = new Date();
    const endDate = new Date();
    const startDate = new Date();

    if (period === 'today') {
      startDate.setHours(0, 0, 0, 0);
    }

    if (period === 'week') {
      startDate.setDate(now.getDate() - 7);
    }

    if (period === 'month') {
      startDate.setMonth(now.getMonth() - 1);
    }

    if (period === 'year') {
      startDate.setFullYear(now.getFullYear() - 1);
    }

    return { startDate, endDate };
  }

  private async getPlatformStats(
    currentUser: CurrentUser,
    period: DashboardPeriod,
    dateRange: { startDate: Date; endDate: Date },
  ) {
    const { startDate, endDate } = dateRange;

    const messageWhere = {
      createdAt: Between(startDate, endDate),
    };

    const [
      tenants,
      totalUsers,
      activeUsers,
      totalMessages,
      sentMessages,
      deliveredMessages,
      queuedMessages,
      failedMessages,
      deadLetterMessages,
      recentMessages,
    ] = await Promise.all([
      this.tenantsRepository.find({
        order: { createdAt: 'DESC' },
      }),

      this.usersRepository.count(),

      this.usersRepository.count({
        where: { isActive: true },
      }),

      this.messagesRepository.count({
        where: messageWhere,
      }),

      this.messagesRepository.count({
        where: {
          ...messageWhere,
          status: MessageStatus.SENT,
        },
      }),

      this.messagesRepository.count({
        where: {
          ...messageWhere,
          status: MessageStatus.DELIVERED,
        },
      }),

      this.messagesRepository.count({
        where: {
          ...messageWhere,
          status: MessageStatus.QUEUED,
        },
      }),

      this.messagesRepository.count({
        where: {
          ...messageWhere,
          status: MessageStatus.FAILED,
        },
      }),

      this.messagesRepository.count({
        where: {
          ...messageWhere,
          status: MessageStatus.DEAD_LETTER,
        },
      }),

      this.messagesRepository.find({
        where: messageWhere,
        order: { createdAt: 'DESC' },
        take: 8,
      }),
    ]);

    const totalCompanies = tenants.length;

    const activeCompanies = tenants.filter(
      (tenant) => tenant.status === TenantStatus.ACTIVE,
    ).length;

    const vipCompanies = tenants.filter((tenant) =>
      [CommercialTier.VIP, CommercialTier.ENTERPRISE].includes(
        tenant.commercialTier,
      ),
    ).length;

    const totalSmsQuota = tenants.reduce(
      (sum, tenant) => sum + tenant.smsQuota,
      0,
    );

    const totalSmsUsed = tenants.reduce(
      (sum, tenant) => sum + tenant.smsUsed,
      0,
    );

    const totalRemainingSms = Math.max(0, totalSmsQuota - totalSmsUsed);

    const usagePercent =
      totalSmsQuota > 0
        ? Number(((totalSmsUsed / totalSmsQuota) * 100).toFixed(1))
        : 0;

    const deliveryRate =
      totalMessages > 0
        ? Number(((deliveredMessages / totalMessages) * 100).toFixed(1))
        : 0;

    const companiesNearQuotaLimit = tenants
      .map((tenant) => {
        const remainingSms = Math.max(0, tenant.smsQuota - tenant.smsUsed);

        const tenantUsagePercent =
          tenant.smsQuota > 0
            ? Number(((tenant.smsUsed / tenant.smsQuota) * 100).toFixed(1))
            : 0;

        return {
          id: tenant.id,
          name: tenant.name,
          status: tenant.status,
          commercialTier: tenant.commercialTier,
          messagePriority: tenant.messagePriority,
          smsQuota: tenant.smsQuota,
          smsUsed: tenant.smsUsed,
          remainingSms,
          usagePercent: tenantUsagePercent,
          quotaStatus:
            tenantUsagePercent >= 100
              ? 'exhausted'
              : tenantUsagePercent >= 95
                ? 'critical'
                : tenantUsagePercent >= 75
                  ? 'low'
                  : 'normal',
        };
      })
      .filter((tenant) => tenant.usagePercent >= 75)
      .sort((a, b) => b.usagePercent - a.usagePercent)
      .slice(0, 10);

    const topCompaniesByUsage = tenants
      .map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        status: tenant.status,
        commercialTier: tenant.commercialTier,
        messagePriority: tenant.messagePriority,
        smsQuota: tenant.smsQuota,
        smsUsed: tenant.smsUsed,
        remainingSms: Math.max(0, tenant.smsQuota - tenant.smsUsed),
        usagePercent:
          tenant.smsQuota > 0
            ? Number(((tenant.smsUsed / tenant.smsQuota) * 100).toFixed(1))
            : 0,
      }))
      .sort((a, b) => b.smsUsed - a.smsUsed)
      .slice(0, 10);

    return {
      currentUser: {
        id: currentUser.id,
        role: currentUser.role,
        tenantId: currentUser.tenantId,
      },

      scope: 'platform',
      period,

      platform: {
        totalCompanies,
        activeCompanies,
        vipCompanies,
        totalUsers,
        activeUsers,
        totalSmsQuota,
        totalSmsUsed,
        totalRemainingSms,
        usagePercent,
      },

      subscription: {
        smsQuota: totalSmsQuota,
        smsUsed: totalSmsUsed,
        remainingSms: totalRemainingSms,
        usagePercent,
        subscriptionStatus: 'platform',
        subscriptionEndDate: null,
      },

      overview: {
        totalUsers,
        activeUsers,
        totalCampaigns: 0,
        totalMessages,
      },

      traffic: {
        sentMessages,
        deliveredMessages,
        queuedMessages,
        failedMessages,
        deadLetterMessages,
        sentToday: sentMessages,
        failedToday: failedMessages,
        deliveryRate,
      },

      companiesNearQuotaLimit,
      topCompaniesByUsage,
      recentMessages,
    };
  }

  private async getSelectedCompanyStats(
    currentUser: CurrentUser,
    selectedTenantId: string,
    period: DashboardPeriod,
    dateRange: { startDate: Date; endDate: Date },
  ) {
    const tenant = await this.tenantsRepository.findOne({
      where: {
        id: selectedTenantId,
      },
    });

    if (!tenant) {
      throw new NotFoundException('Selected company not found');
    }

    const fakeTenantUser: CurrentUser = {
      id: currentUser.id,
      role: 'admin',
      tenantId: selectedTenantId,
    };

    const tenantStats = await this.getTenantStats(
      fakeTenantUser,
      period,
      dateRange,
    );

    return {
      ...tenantStats,
      scope: 'selected_company',
      currentUser: {
        id: currentUser.id,
        role: currentUser.role,
        tenantId: currentUser.tenantId,
      },
      selectedCompany: {
        id: tenant.id,
        name: tenant.name,
        status: tenant.status,
        commercialTier: tenant.commercialTier,
        messagePriority: tenant.messagePriority,
      },
    };
  }

  private async getTenantStats(
    currentUser: CurrentUser,
    period: DashboardPeriod,
    dateRange: { startDate: Date; endDate: Date },
  ) {
    const { tenantId } = currentUser;
    const { startDate, endDate } = dateRange;

    const baseMessageWhere =
      currentUser.role === 'user'
        ? {
            tenantId,
            createdByUserId: currentUser.id,
          }
        : {
            tenantId,
          };

    const messageWhere = {
      ...baseMessageWhere,
      createdAt: Between(startDate, endDate),
    };

    const tenant = await this.tenantsRepository.findOne({
      where: { id: tenantId },
    });

    const [
      totalUsers,
      activeUsers,
      totalMessages,
      sentMessages,
      deliveredMessages,
      queuedMessages,
      failedMessages,
      deadLetterMessages,
      recentMessages,
    ] = await Promise.all([
      this.usersRepository.count({
        where: { tenantId },
      }),

      this.usersRepository.count({
        where: { tenantId, isActive: true },
      }),

      this.messagesRepository.count({
        where: messageWhere,
      }),

      this.messagesRepository.count({
        where: {
          ...messageWhere,
          status: MessageStatus.SENT,
        },
      }),

      this.messagesRepository.count({
        where: {
          ...messageWhere,
          status: MessageStatus.DELIVERED,
        },
      }),

      this.messagesRepository.count({
        where: {
          ...messageWhere,
          status: MessageStatus.QUEUED,
        },
      }),

      this.messagesRepository.count({
        where: {
          ...messageWhere,
          status: MessageStatus.FAILED,
        },
      }),

      this.messagesRepository.count({
        where: {
          ...messageWhere,
          status: MessageStatus.DEAD_LETTER,
        },
      }),

      this.messagesRepository.find({
        where: messageWhere,
        order: { createdAt: 'DESC' },
        take: 5,
      }),
    ]);

    const safeTotalUsers = currentUser.role === 'user' ? 1 : totalUsers;
    const safeActiveUsers = currentUser.role === 'user' ? 1 : activeUsers;

    const smsQuota = tenant?.smsQuota ?? 0;
    const smsUsed = tenant?.smsUsed ?? 0;
    const remainingSms = Math.max(0, smsQuota - smsUsed);

    const usagePercent =
      smsQuota > 0 ? Number(((smsUsed / smsQuota) * 100).toFixed(1)) : 0;

    const deliveryRate =
      totalMessages > 0
        ? Number(((deliveredMessages / totalMessages) * 100).toFixed(1))
        : 0;

    return {
      currentUser: {
        id: currentUser.id,
        role: currentUser.role,
        tenantId: currentUser.tenantId,
      },

      scope: 'tenant',
      period,

      tenant: tenant
        ? {
            id: tenant.id,
            name: tenant.name,
            status: tenant.status,
            commercialTier: tenant.commercialTier,
            messagePriority: tenant.messagePriority,
          }
        : null,

      subscription: {
        smsQuota,
        smsUsed,
        remainingSms,
        usagePercent,
        subscriptionStatus: tenant?.subscriptionStatus ?? null,
        subscriptionEndDate: tenant?.subscriptionEndDate ?? null,
      },

      overview: {
        totalUsers: safeTotalUsers,
        activeUsers: safeActiveUsers,
        totalCampaigns: 0,
        totalMessages,
      },

      traffic: {
        sentMessages,
        deliveredMessages,
        queuedMessages,
        failedMessages,
        deadLetterMessages,
        sentToday: sentMessages,
        failedToday: failedMessages,
        deliveryRate,
      },

      recentMessages,
    };
  }
}