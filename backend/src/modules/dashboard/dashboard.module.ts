import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { User } from '../users/entities/user.entity';
import { SmsMessage } from '../sms/entities/sms.entity';
import { Tenant } from '../tenants/entities/tenant.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, SmsMessage, Tenant])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}