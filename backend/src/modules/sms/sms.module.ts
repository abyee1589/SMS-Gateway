import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { SmsService } from './sms.service';
import { SmsController } from './sms.controller';
import { SmsWebhookController } from './sms-webhook.controller';
import { SmsMessage } from './entities/sms.entity';
import { SmsProcessor } from './sms.processor';
import { SMS_QUEUE } from './constants/sms.constants';
import { SmsProviderFactory } from './providers/sms-provider.factory';
import { AfricasTalkingSmsProvider } from './providers/africastalking-sms.provider';
import { TenantsModule } from '../tenants/tenants.module';
import { ZergawSmsProvider } from './providers/zergaw-sms.provider';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([SmsMessage]),
    BullModule.registerQueue({
      name: SMS_QUEUE,
    }),
    TenantsModule
  ],
  providers: [
    SmsService,
    SmsProcessor,
    SmsProviderFactory,
    AfricasTalkingSmsProvider,
    ZergawSmsProvider,
  ],
  controllers: [SmsController, SmsWebhookController],
  exports: [SmsService],
})
export class SmsModule {}