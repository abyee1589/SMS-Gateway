import {
  Body,
  Controller,
  Headers,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsService } from './sms.service';

@Controller('webhooks/sms')
export class SmsWebhookController {
  private readonly logger = new Logger(SmsWebhookController.name);

  constructor(
    private readonly smsService: SmsService,
    private readonly configService: ConfigService,
  ) {}

  @Post('delivery')
  async handleDeliveryWebhook(
    @Body() body: any,
    @Headers('x-webhook-secret') secret: string,
  ) {
    const webhookSecret = this.configService.get<string>('SMS_WEBHOOK_SECRET');

    if (!webhookSecret) {
      throw new UnauthorizedException('Webhook secret is not configured');
    }

    if (secret !== webhookSecret) {
      this.logger.warn(
        JSON.stringify({
          event: 'sms_webhook_unauthorized',
          receivedSecret: secret ?? null,
        }),
      );
      throw new UnauthorizedException('Invalid webhook secret');
    }

    const providerMessageId =
      body?.providerMessageId ||
      body?.messageId ||
      body?.message_id ||
      body?.id;

    const providerStatus =
      body?.status ||
      body?.deliveryStatus ||
      body?.messageStatus ||
      body?.message_status;

    const errorMessage =
      body?.errorMessage ||
      body?.error_message ||
      body?.failureReason ||
      body?.failure_reason;

    if (!providerMessageId) {
      return {
        received: true,
        ignored: true,
        reason: 'missing_provider_message_id',
      };
    }

    const message = await this.smsService.updateDeliveryStatusFromWebhook({
      providerMessageId,
      providerStatus,
      deliveredAt: new Date(),
      errorMessage,
    });

    return {
      received: true,
      messageId: message.id,
      status: message.status,
    };
  }
}