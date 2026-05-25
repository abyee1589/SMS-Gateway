import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsGatewayProvider } from './sms-provider.interface';
import { MockSmsProvider } from './mock-sms.provider';
import { AfricasTalkingSmsProvider } from './africastalking-sms.provider';
import { ZergawSmsProvider } from './zergaw-sms.provider';

@Injectable()
export class SmsProviderFactory {
  constructor(
    private readonly configService: ConfigService,
    private readonly africasTalkingProvider: AfricasTalkingSmsProvider,
    private readonly zergawSmsProvider: ZergawSmsProvider,
  ) {}

  getProvider(): SmsGatewayProvider {
    const provider = this.getProviderName();

    switch (provider) {
      case 'africastalking':
        return this.africasTalkingProvider;

      case 'zergaw':
        return this.zergawSmsProvider;

      case 'mock':
      default:
        return new MockSmsProvider();
    }
  }

  getProviderName() {
    return this.configService.get<string>('SMS_PROVIDER') || 'mock';
  }
}