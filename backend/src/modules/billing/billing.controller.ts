import { Controller, Post, UseGuards } from '@nestjs/common';
import { BillingNotificationsService } from './billing-notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('billing')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillingController {
  constructor(
    private readonly billingNotificationsService: BillingNotificationsService,
  ) {}

  @Post('test-notifications')
  @Roles(UserRole.SUPER_ADMIN)
  async testNotifications() {
    await this.billingNotificationsService.sendSubscriptionExpiryEmails();
    await this.billingNotificationsService.sendSmsUsageEmails();

    return {
      success: true,
      message: 'Billing notifications checked',
    };
  }
}