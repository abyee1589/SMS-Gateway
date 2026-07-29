import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SMS_QUEUE } from '../sms/constants/sms.constants';
import { CAMPAIGN_QUEUE } from '../campaigns/constants/campaign.constants';

type HealthStatus = 'ok' | 'error';

@Injectable()
export class HealthService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,

    @InjectQueue(SMS_QUEUE)
    private readonly smsQueue: Queue,

    @InjectQueue(CAMPAIGN_QUEUE)
    private readonly campaignQueue: Queue,
  ) {}

  async getLiveness() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'nexusmsg-backend',
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  async getReadiness() {
    const checks = {
      database: {
        status: 'unknown' as HealthStatus | 'unknown',
      },
      smsQueue: {
        status: 'unknown' as HealthStatus | 'unknown',
        counts: null as Awaited<ReturnType<Queue['getJobCounts']>> | null,
      },
      campaignQueue: {
        status: 'unknown' as HealthStatus | 'unknown',
        counts: null as Awaited<ReturnType<Queue['getJobCounts']>> | null,
      },
    };

    let overallStatus: HealthStatus = 'ok';

    try {
      await this.dataSource.query('SELECT 1');
      checks.database.status = 'ok';
    } catch {
      checks.database.status = 'error';
      overallStatus = 'error';
    }

    try {
      const client = await this.smsQueue.client;
      await client.ping();

      checks.smsQueue.counts = await this.smsQueue.getJobCounts(
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed',
        'paused',
      );
      checks.smsQueue.status = 'ok';
    } catch {
      checks.smsQueue.status = 'error';
      overallStatus = 'error';
    }

    try {
      const client = await this.campaignQueue.client;
      await client.ping();

      checks.campaignQueue.counts = await this.campaignQueue.getJobCounts(
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed',
        'paused',
      );
      checks.campaignQueue.status = 'ok';
    } catch {
      checks.campaignQueue.status = 'error';
      overallStatus = 'error';
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      service: 'nexusmsg-backend',
      checks,
    };
  }

  async getOverallHealth() {
    const readiness = await this.getReadiness();

    return {
      ...readiness,
    };
  }
}