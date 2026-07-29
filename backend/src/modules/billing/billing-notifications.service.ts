import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { MailService } from '../mail/mail.service';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import {
  BillingNotificationLog,
  BillingNotificationType,
} from './entities/billing-notification-log.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';


type SmsUsageNotificationLevel = {
  type: BillingNotificationType;
  label: string;
  subject: string;
  tone: 'reminder' | 'critical' | 'exhausted';
};

@Injectable()
export class BillingNotificationsService {
  private readonly logger = new Logger(BillingNotificationsService.name);

  private readonly blockedPlaceholderDomains = new Set([
    'nexus.com',
    'example.com',
    'test.com',
    'localhost',
  ]);

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(BillingNotificationLog)
    private readonly notificationLogRepository: Repository<BillingNotificationLog>,

    private readonly mailService: MailService,

    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async sendDailyBillingNotifications() {
    this.logger.log('Checking billing notifications...');

    try {
      await this.sendSubscriptionExpiryEmails();
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unknown subscription notification error';

      this.logger.error(`Subscription notification job failed: ${errorMessage}`);
    }

    try {
      await this.sendSmsUsageEmails();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown SMS usage notification error';

      this.logger.error(`SMS usage notification job failed: ${errorMessage}`);
    }
  }

  async sendSubscriptionExpiryEmails() {
    const today = this.startOfDay(new Date());
    const reminderDays = [7, 3, 1, 0];

    for (const daysLeft of reminderDays) {
      const targetDate = this.addDays(today, daysLeft);
      const targetDateString = this.toDateString(targetDate);

      const tenants = await this.tenantRepository.find({
        where: {
          subscriptionEndDate: Between(
            this.startOfDay(targetDate),
            this.endOfDay(targetDate),
          ) as any,
        },
      });

      for (const tenant of tenants) {
        const type = this.getSubscriptionNotificationType(daysLeft);

        await this.notifyTenantAdmins({
          tenant,
          type,
          targetDate: targetDateString,
          subject:
            daysLeft === 0
              ? 'Your NexusMsg subscription expires today'
              : `Your NexusMsg subscription expires in ${daysLeft} day${
                  daysLeft === 1 ? '' : 's'
                }`,
          html: this.renderSubscriptionExpiryEmail(tenant, daysLeft),
        });
      }
    }
  }

  async sendSmsUsageEmails() {
    const reminderPercent = Number(process.env.SMS_USAGE_REMINDER_PERCENT || 75);
    const criticalPercent = Number(process.env.SMS_USAGE_CRITICAL_PERCENT || 95);
    const exhaustedPercent = Number(
      process.env.SMS_USAGE_EXHAUSTED_PERCENT || 100,
    );

    const tenants = await this.tenantRepository
      .createQueryBuilder('tenant')
      .where('tenant.smsQuota > 0')
      .andWhere('tenant.smsUsed > 0')
      .getMany();

    const targetDate = this.toDateString(new Date());

    for (const tenant of tenants) {
      const smsQuota = Number(tenant.smsQuota || 0);
      const smsUsed = Number(tenant.smsUsed || 0);

      if (smsQuota <= 0) {
        continue;
      }

      const usagePercent = Math.min((smsUsed / smsQuota) * 100, 100);
      const remaining = Math.max(smsQuota - smsUsed, 0);

      const level = this.getSmsUsageNotificationLevel({
        usagePercent,
        reminderPercent,
        criticalPercent,
        exhaustedPercent,
      });

      if (!level) {
        continue;
      }

      await this.notifyTenantAdmins({
        tenant,
        type: level.type,
        targetDate,
        subject: level.subject,
        html: this.renderSmsUsageEmail({
          tenant,
          remaining,
          smsQuota,
          smsUsed,
          usagePercent,
          level,
        }),
      });
    }
  }

  private async notifyTenantAdmins({
    tenant,
    type,
    targetDate,
    subject,
    html,
  }: {
    tenant: Tenant;
    type: BillingNotificationType;
    targetDate: string;
    subject: string;
    html: string;
  }) {
    const admins = await this.userRepository.find({
      where: {
        tenantId: tenant.id,
        role: In(['admin']) as any,
        isActive: true,
      },
    });

    if (!admins.length) {
      this.logger.warn(`No active admin found for tenant ${tenant.id}`);
      return;
    }

    for (const admin of admins) {
      const email = admin.email?.trim().toLowerCase();

      await this.sendInAppBillingNotification({
        tenant,
        admin,
        type,
        targetDate,
        subject,
      });

      if (!this.isDeliverableAdminEmail(email)) {
        this.logger.warn(
          `Skipping billing email for placeholder or invalid address: ${admin.email}`,
        );
        continue;
      }

      const existing = await this.notificationLogRepository.findOne({
        where: {
          tenantId: tenant.id,
          type,
          targetDate,
          recipientEmail: email,
        },
      });

      if (existing?.sent) {
        continue;
      }

      try {
        await this.mailService.sendMail({
          to: email,
          subject,
          html,
          text: this.stripHtml(html),
        });

        if (existing) {
          await this.notificationLogRepository.update(existing.id, {
            sent: true,
            errorMessage: null,
          });
        } else {
          await this.notificationLogRepository.save({
            tenantId: tenant.id,
            type,
            targetDate,
            recipientEmail: email,
            sent: true,
            errorMessage: null,
          });
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown email error';

        if (existing) {
          await this.notificationLogRepository.update(existing.id, {
            sent: false,
            errorMessage,
          });
        } else {
          await this.notificationLogRepository.save({
            tenantId: tenant.id,
            type,
            targetDate,
            recipientEmail: email,
            sent: false,
            errorMessage,
          });
        }

        this.logger.error(
          `Failed to send ${type} email to ${email}: ${errorMessage}`,
        );
      }
    }
  }
  private async sendInAppBillingNotification({
  tenant,
  admin,
  type,
  targetDate,
  subject,
}: {
  tenant: Tenant;
  admin: User;
  type: BillingNotificationType;
  targetDate: string;
  subject: string;
}) {
  const notificationType = this.mapBillingTypeToNotificationType(type);

  const message = this.getInAppBillingMessage({
    tenant,
    type,
  });

  await this.notificationsService.createOnce({
    tenantId: tenant.id,
    userId: admin.id,
    type: notificationType,
    title: subject,
    message,
    actionUrl: '/billing',
    dedupeKey: `${tenant.id}:${admin.id}:${type}:${targetDate}`,
    metadata: {
      billingNotificationType: type,
      targetDate,
      tenantName: tenant.name,
      smsQuota: tenant.smsQuota,
      smsUsed: tenant.smsUsed,
      subscriptionEndDate: tenant.subscriptionEndDate
        ? tenant.subscriptionEndDate.toISOString()
        : null,
    },
  });
}

  private mapBillingTypeToNotificationType(
    type: BillingNotificationType,
  ): NotificationType {
    if (type === 'sms_usage_exhausted_100_percent') {
      return NotificationType.EXHAUSTED_QUOTA;
    }

    if (type === 'sms_usage_critical_95_percent') {
      return NotificationType.CRITICAL_QUOTA;
    }

    if (type === 'sms_usage_reminder_75_percent') {
      return NotificationType.LOW_QUOTA;
    }

    if (type === 'subscription_expired') {
      return NotificationType.SUBSCRIPTION_EXPIRED;
    }

    return NotificationType.SUBSCRIPTION_EXPIRING;
  }

  private getInAppBillingMessage({
    tenant,
    type,
  }: {
    tenant: Tenant;
    type: BillingNotificationType;
  }) {
    const smsQuota = Number(tenant.smsQuota || 0);
    const smsUsed = Number(tenant.smsUsed || 0);
    const remaining = Math.max(smsQuota - smsUsed, 0);
    const usagePercent =
      smsQuota > 0 ? Math.min(Math.round((smsUsed / smsQuota) * 100), 100) : 0;

    if (type === 'sms_usage_exhausted_100_percent') {
      return `${tenant.name} has used all SMS credits. Remaining balance: ${remaining}.`;
    }

    if (type === 'sms_usage_critical_95_percent') {
      return `${tenant.name} has used ${usagePercent}% of its SMS credits. Remaining balance: ${remaining}.`;
    }

    if (type === 'sms_usage_reminder_75_percent') {
      return `${tenant.name} has used ${usagePercent}% of its SMS credits. Remaining balance: ${remaining}.`;
    }

    if (type === 'subscription_expired') {
      return `${tenant.name} subscription expires today. Renew the subscription to avoid service interruption.`;
    }

    return `${tenant.name} subscription is close to expiry. Please review the billing page.`;
  }
  private isDeliverableAdminEmail(email?: string) {
    if (!email) return false;

    const normalizedEmail = email.trim().toLowerCase();
    const basicEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!basicEmailPattern.test(normalizedEmail)) {
      return false;
    }

    const domain = normalizedEmail.split('@')[1];

    if (!domain) {
      return false;
    }

    if (this.blockedPlaceholderDomains.has(domain)) {
      return false;
    }

    return true;
  }

  private getSubscriptionNotificationType(
    daysLeft: number,
  ): BillingNotificationType {
    if (daysLeft === 7) return 'subscription_expiring_7_days';
    if (daysLeft === 3) return 'subscription_expiring_3_days';
    if (daysLeft === 1) return 'subscription_expiring_1_day';

    return 'subscription_expired';
  }

  private getSmsUsageNotificationLevel({
    usagePercent,
    reminderPercent,
    criticalPercent,
    exhaustedPercent,
  }: {
    usagePercent: number;
    reminderPercent: number;
    criticalPercent: number;
    exhaustedPercent: number;
  }): SmsUsageNotificationLevel | null {
    if (usagePercent >= exhaustedPercent) {
      return {
        type: 'sms_usage_exhausted_100_percent',
        label: '100% used',
        subject: 'Your NexusMsg SMS balance is exhausted',
        tone: 'exhausted',
      };
    }

    if (usagePercent >= criticalPercent) {
      return {
        type: 'sms_usage_critical_95_percent',
        label: '95% used',
        subject: 'Critical: Your NexusMsg SMS balance is almost exhausted',
        tone: 'critical',
      };
    }

    if (usagePercent >= reminderPercent) {
      return {
        type: 'sms_usage_reminder_75_percent',
        label: '75% used',
        subject: 'Reminder: Your NexusMsg SMS balance is running low',
        tone: 'reminder',
      };
    }

    return null;
  }

  private renderSubscriptionExpiryEmail(tenant: Tenant, daysLeft: number) {
    const companyName = tenant.name || 'your company';

    const headline =
      daysLeft === 0
        ? 'Your subscription expires today'
        : `Your subscription expires in ${daysLeft} day${
            daysLeft === 1 ? '' : 's'
          }`;

    const message =
      daysLeft === 0
        ? 'Your NexusMsg subscription expires today. Please contact your platform administrator to renew your plan.'
        : `Your NexusMsg subscription for ${companyName} is about to expire. Please renew your plan to avoid service interruption.`;

    return `
      <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
        <h2>${headline}</h2>
        <p>${message}</p>

        <div style="margin: 20px 0; padding: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;">
          <p style="margin: 0;"><strong>Company:</strong> ${companyName}</p>
          <p style="margin: 8px 0 0;"><strong>Subscription end date:</strong> ${
            tenant.subscriptionEndDate
              ? new Date(tenant.subscriptionEndDate).toLocaleDateString()
              : 'Not set'
          }</p>
        </div>

        <p>If you already renewed your subscription, you can ignore this message.</p>

        <p style="margin-top: 24px; color: #64748b;">
          NexusMsg Billing Notifications
        </p>
      </div>
    `;
  }

  private renderSmsUsageEmail({
    tenant,
    remaining,
    smsQuota,
    smsUsed,
    usagePercent,
    level,
  }: {
    tenant: Tenant;
    remaining: number;
    smsQuota: number;
    smsUsed: number;
    usagePercent: number;
    level: SmsUsageNotificationLevel;
  }) {
    const companyName = tenant.name || 'your company';
    const roundedUsage = Math.round(usagePercent);

    const borderColor =
      level.tone === 'exhausted'
        ? '#fecaca'
        : level.tone === 'critical'
          ? '#fed7aa'
          : '#fde68a';

    const backgroundColor =
      level.tone === 'exhausted'
        ? '#fef2f2'
        : level.tone === 'critical'
          ? '#fff7ed'
          : '#fffbeb';

    const headline =
      level.tone === 'exhausted'
        ? 'Your SMS balance is exhausted'
        : level.tone === 'critical'
          ? 'Your SMS balance is critically low'
          : 'Your SMS balance is running low';

    const message =
      level.tone === 'exhausted'
        ? `Your NexusMsg SMS quota for ${companyName} has been fully used. Please request a top-up to continue sending messages.`
        : level.tone === 'critical'
          ? `Your NexusMsg SMS usage for ${companyName} has reached a critical level. Please request a top-up soon to avoid message sending interruptions.`
          : `Your NexusMsg SMS usage for ${companyName} has reached the reminder level. Consider requesting a top-up before the balance becomes critical.`;

    return `
      <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
        <h2>${headline}</h2>

        <p>${message}</p>

        <div style="margin: 20px 0; padding: 16px; background: ${backgroundColor}; border: 1px solid ${borderColor}; border-radius: 12px;">
          <p style="margin: 0;"><strong>Company:</strong> ${companyName}</p>
          <p style="margin: 8px 0 0;"><strong>Usage level:</strong> ${level.label}</p>
          <p style="margin: 8px 0 0;"><strong>Current usage:</strong> ${roundedUsage}%</p>
          <p style="margin: 8px 0 0;"><strong>SMS used:</strong> ${smsUsed}</p>
          <p style="margin: 8px 0 0;"><strong>SMS quota:</strong> ${smsQuota}</p>
          <p style="margin: 8px 0 0;"><strong>Remaining SMS:</strong> ${remaining}</p>
        </div>

        <p>If you already requested a top-up, you can ignore this message.</p>

        <p style="margin-top: 24px; color: #64748b;">
          NexusMsg Billing Notifications
        </p>
      </div>
    `;
  }

  private startOfDay(date: Date) {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  private endOfDay(date: Date) {
    const copy = new Date(date);
    copy.setHours(23, 59, 59, 999);
    return copy;
  }

  private addDays(date: Date, days: number) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
  }

  private toDateString(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private stripHtml(html: string) {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}