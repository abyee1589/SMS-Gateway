import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { SmsMessage, MessageStatus } from '../sms/entities/sms.entity';
import { Tenant } from '../tenants/entities/tenant.entity';

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
  ) {
    const { tenantId } = currentUser;

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
      totalCampaigns,
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

      // temporary until Campaign repository is injected
      Promise.resolve(0),

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
        role: currentUser.role,
      },

      period,

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
        totalCampaigns,
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