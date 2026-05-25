import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import africastalking from 'africastalking';
import {
  SendSmsInput,
  SendSmsResult,
  SmsGatewayProvider,
} from './sms-provider.interface';

@Injectable()
export class AfricasTalkingSmsProvider implements SmsGatewayProvider {
  constructor(private readonly configService: ConfigService) {}

  async sendSms(input: SendSmsInput): Promise<SendSmsResult> {
    const username = this.configService.get<string>('AT_APP_USERNAME');
    const apiKey = this.configService.get<string>('AT_APP_API_KEY');
    const senderId = this.configService.get<string>('AT_SENDER_ID') || undefined;

    if (!username || !apiKey) {
      return {
        normalizedStatus: 'failed',
        rawStatus: 'missing_credentials',
        errorCode: 'AT_MISSING_CREDENTIALS',
        errorMessage: 'Africa’s Talking credentials are missing',
        failureType: 'auth',
      };
    }

    const client = africastalking({
      username,
      apiKey,
    });

    const sms = client.SMS;

    try {
      const options: Record<string, unknown> = {
        to: [input.recipient],
        message: input.content,
      };

      if (senderId) {
        options.from = senderId;
      }

      const response = await sms.send(options);

      const messageData =
        (response as any)?.SMSMessageData ||
        (response as any)?.data?.SMSMessageData ||
        response;

      const recipient = messageData?.Recipients?.[0];

      const providerMessageId =
        recipient?.messageId ||
        recipient?.message_id ||
        recipient?.id ||
        undefined;

      const rawStatus = recipient?.status || messageData?.Message || 'accepted';

      return {
        providerMessageId: providerMessageId || undefined,
        normalizedStatus: 'sent',
        rawStatus,
        acceptedAt: new Date(),
        raw: response,
      };
    } catch (error: any) {
      const statusCode = error?.response?.status;
      const message =
        error?.response?.data?.errorMessage ||
        error?.message ||
        'Africa’s Talking SMS send failed';

      let failureType: SendSmsResult['failureType'] = 'unknown';
      let errorCode = 'AT_SEND_FAILED';

      if (statusCode === 401 || statusCode === 403) {
        failureType = 'auth';
        errorCode = 'AT_AUTH_FAILED';
      } else if (statusCode === 429) {
        failureType = 'rate_limit';
        errorCode = 'AT_RATE_LIMIT';
      } else if (statusCode >= 500) {
        failureType = 'temporary';
        errorCode = 'AT_TEMPORARY_FAILURE';
      } else if (statusCode >= 400) {
        failureType = 'permanent';
        errorCode = 'AT_PERMANENT_FAILURE';
      }

      return {
        normalizedStatus: 'failed',
        rawStatus: String(statusCode || 'failed'),
        errorCode,
        errorMessage: message,
        failureType,
        raw: error?.response?.data || error,
      };
    }
  }
}