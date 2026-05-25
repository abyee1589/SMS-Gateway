import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SMS_QUEUE } from '../sms/constants/sms.constants';

@Injectable()
export class HealthService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectQueue(SMS_QUEUE)
    private readonly smsQueue: Queue,
  ) {}

  async getLiveness() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'nexusmsg-backend',
    };
  }

  async getReadiness() {
    const checks = {
      database: {
        status: 'unknown' as 'ok' | 'error',
      },
      redisQueue: {
        status: 'unknown' as 'ok' | 'error',
      },
    };

    let overallStatus: 'ok' | 'error' = 'ok';

    try {
      await this.dataSource.query('SELECT 1');
      checks.database.status = 'ok';
    } catch {
      checks.database.status = 'error';
      overallStatus = 'error';
    }

    try {
      await this.smsQueue.getJobCounts();
      checks.redisQueue.status = 'ok';
    } catch {
      checks.redisQueue.status = 'error';
      overallStatus = 'error';
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  async getOverallHealth() {
    const readiness = await this.getReadiness();

    return {
      service: 'nexusmsg-backend',
      ...readiness,
    };
  }
}