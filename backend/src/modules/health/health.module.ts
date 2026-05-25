import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { SMS_QUEUE } from '../sms/constants/sms.constants';

@Module({
  imports: [
    BullModule.registerQueue({
      name: SMS_QUEUE,
    }),
  ],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}