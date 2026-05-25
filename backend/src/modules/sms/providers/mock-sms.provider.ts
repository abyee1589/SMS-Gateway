import { Injectable } from '@nestjs/common';
import {
  SendSmsInput,
  SendSmsResult,
  SmsGatewayProvider,
} from './sms-provider.interface';

@Injectable()
export class MockSmsProvider implements SmsGatewayProvider {
  async sendSms(input: SendSmsInput): Promise<SendSmsResult> {
    await new Promise((resolve) => setTimeout(resolve, 500));

    return {

      normalizedStatus: 'failed',
      rawStatus: 'temporary_error',
      errorCode: 'MOCK_TEMP',
      errorMessage: 'Temporary provider error',
      failureType: 'temporary',
      // providerMessageId: `mock-${Date.now()}`,
      // normalizedStatus: 'sent',
      // rawStatus: 'mock_sent',
      // acceptedAt: new Date(),
      // raw: {
      //   recipient: input.recipient,
      //   idempotencyKey: input.idempotencyKey,
      // },
    };
  }
}