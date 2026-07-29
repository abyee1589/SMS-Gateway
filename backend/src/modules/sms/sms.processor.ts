import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Logger, Inject, forwardRef } from '@nestjs/common';

import { SmsMessage, MessageStatus } from './entities/sms.entity';
import { TenantsService } from '../tenants/tenants.service';
import { SMS_MAX_RETRIES, SMS_QUEUE } from './constants/sms.constants';
import { SmsProviderFactory } from './providers/sms-provider.factory';
import { CampaignsService } from '../campaigns/campaigns.service';

interface SmsJobData {
  messageId: string;
  recipient: string;
  content: string;
  idempotencyKey?: string;
  campaignId?: string | null;
}

@Processor(SMS_QUEUE)
export class SmsProcessor extends WorkerHost {
  private readonly logger = new Logger(SmsProcessor.name);

  constructor(
    @InjectRepository(SmsMessage)
    private readonly smsRepository: Repository<SmsMessage>,

    private readonly smsProviderFactory: SmsProviderFactory,

    private readonly tenantsService: TenantsService,

    @Inject(forwardRef(() => CampaignsService))
    private readonly campaignsService: CampaignsService,
  ) {
    super();
  }

  async process(job: Job<SmsJobData>) {
    const { messageId, recipient, content, idempotencyKey } = job.data;

    const message = await this.smsRepository.findOne({
      where: { id: messageId },
    });

    if (!message) {
      throw new Error(`Message ${messageId} not found`);
    }

    if (message.status === MessageStatus.CANCELLED) {
      this.logger.warn(
        JSON.stringify({
          event: 'sms_job_skipped_cancelled',
          messageId,
          tenantId: message.tenantId,
        }),
      );

      return {
        success: false,
        messageId,
        skipped: true,
        reason: 'cancelled',
      };
    }

    if (
      message.status === MessageStatus.SENT ||
      message.status === MessageStatus.DELIVERED
    ) {
      this.logger.warn(
        JSON.stringify({
          event: 'sms_job_skipped_already_sent',
          messageId,
          tenantId: message.tenantId,
          status: message.status,
        }),
      );

      return {
        success: true,
        messageId,
        skipped: true,
        reason: 'already_sent',
      };
    }

    try {
      await this.tenantsService.assertCanSendMessages(message.tenantId, 1);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Tenant cannot send messages';

      await this.smsRepository.update(messageId, {
        status: MessageStatus.DEAD_LETTER,
        errorMessage,
        failureType: 'quota_or_subscription',
        deadLetteredAt: new Date(),
      });

      await this.recordCampaignFailureIfNeeded(message);

      this.logger.warn(
        JSON.stringify({
          event: 'sms_job_blocked_by_quota_or_subscription',
          messageId,
          tenantId: message.tenantId,
          errorMessage,
          nextStatus: MessageStatus.DEAD_LETTER,
        }),
      );

      return {
        success: false,
        messageId,
        blocked: true,
        deadLetter: true,
        reason: errorMessage,
      };
    }

    try {
      await this.smsRepository.update(messageId, {
        status: MessageStatus.PROCESSING,
      });

      const provider = this.smsProviderFactory.getProvider();
      const providerName = this.smsProviderFactory.getProviderName();

      const providerResponse = await provider.sendSms({
        recipient,
        content,
        idempotencyKey,
      });

      if (providerResponse.normalizedStatus === 'failed') {
        const retryable = this.isRetryableProviderFailure(
          providerResponse.failureType,
        );

        const nextRetryCount = Number(message.retryCount || 0) + 1;
        const retriesExhausted = nextRetryCount >= SMS_MAX_RETRIES;

        const nextStatus =
          retryable && !retriesExhausted
            ? MessageStatus.FAILED
            : MessageStatus.DEAD_LETTER;

        const finalFailureType = retryable
          ? retriesExhausted
            ? 'retry_exhausted'
            : providerResponse.failureType || 'temporary_failure'
          : providerResponse.failureType || 'permanent_failure';

        await this.smsRepository.update(messageId, {
          status: nextStatus,
          providerName,
          providerStatus: providerResponse.rawStatus,
          providerErrorCode: providerResponse.errorCode,
          errorMessage:
            providerResponse.errorMessage || 'SMS provider returned failure',
          failureType: finalFailureType,
          retryCount: nextRetryCount,
          deadLetteredAt:
            nextStatus === MessageStatus.DEAD_LETTER ? new Date() : undefined,
        });

        this.logger.error(
          JSON.stringify({
            event:
              nextStatus === MessageStatus.DEAD_LETTER
                ? 'sms_dead_letter'
                : 'sms_send_failed_retryable',
            messageId,
            providerName,
            providerStatus: providerResponse.rawStatus ?? null,
            providerErrorCode: providerResponse.errorCode ?? null,
            failureType: finalFailureType,
            tenantId: message.tenantId,
            retryCount: nextRetryCount,
            maxRetries: SMS_MAX_RETRIES,
            retryable,
            retriesExhausted,
            errorMessage: providerResponse.errorMessage ?? null,
          }),
        );

        if (nextStatus === MessageStatus.DEAD_LETTER) {
          await this.recordCampaignFailureIfNeeded(message);

          return {
            success: false,
            messageId,
            deadLetter: true,
            retryable,
            retriesExhausted,
          };
        }

        throw new Error(
          providerResponse.errorMessage || 'Retryable SMS provider failure',
        );
      }

      const latestBeforeSuccess = await this.smsRepository.findOne({
        where: { id: messageId },
      });

      await this.smsRepository.update(messageId, {
        status: MessageStatus.SENT,
        providerMessageId: providerResponse.providerMessageId,
        providerName,
        providerStatus: providerResponse.rawStatus ?? null,
        providerErrorCode: providerResponse.errorCode ?? null,
        errorMessage: null,
        failureType: null,
        deadLetteredAt: null,
        sentAt: providerResponse.acceptedAt || new Date(),
      });

      if (latestBeforeSuccess?.status !== MessageStatus.SENT) {
        await this.tenantsService.incrementSmsUsage(
          message.tenantId,
          1,
          messageId,
          message.createdByUserId ?? undefined,
        );
      }

      this.logger.log(
        JSON.stringify({
          event: 'sms_send_success',
          messageId,
          providerName,
          providerMessageId: providerResponse.providerMessageId ?? null,
          providerStatus: providerResponse.rawStatus ?? null,
          tenantId: message.tenantId,
          retryCount: message.retryCount ?? 0,
        }),
      );

      const shouldSimulateDelivery = providerName === 'mock';

      if (shouldSimulateDelivery) {
        setTimeout(async () => {
          try {
            await this.smsRepository.update(messageId, {
              status: MessageStatus.DELIVERED,
              deliveredAt: new Date(),
            });

            this.logger.log(
              JSON.stringify({
                event: 'sms_delivered_simulated',
                messageId,
                tenantId: message.tenantId,
                providerName,
              }),
            );
          } catch {
            this.logger.error(
              `Failed to mark message ${messageId} as delivered`,
            );
          }
        }, 2000);
      }

      return {
        success: true,
        messageId,
      };
    } catch (error) {
      const latest = await this.smsRepository.findOne({
        where: { id: messageId },
      });

      if (!latest) {
        throw error;
      }

      if (
        latest.status === MessageStatus.DEAD_LETTER ||
        latest.status === MessageStatus.SENT ||
        latest.status === MessageStatus.DELIVERED ||
        latest.status === MessageStatus.CANCELLED
      ) {
        return {
          success: latest.status === MessageStatus.SENT,
          messageId,
          status: latest.status,
        };
      }

      if (latest.status === MessageStatus.FAILED) {
        throw error;
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown SMS send error';

      const isPermanent = this.isPermanentFailure(error);
      const nextRetryCount = Number(latest.retryCount || 0) + 1;
      const retriesExhausted = nextRetryCount >= SMS_MAX_RETRIES;

      const nextStatus =
        isPermanent || retriesExhausted
          ? MessageStatus.DEAD_LETTER
          : MessageStatus.FAILED;

      const failureType = isPermanent
        ? 'permanent_failure'
        : retriesExhausted
          ? 'retry_exhausted'
          : 'temporary_failure';

      await this.smsRepository.update(messageId, {
        status: nextStatus,
        errorMessage,
        retryCount: nextRetryCount,
        failureType,
        providerStatus: undefined,
        providerErrorCode: undefined,
        deadLetteredAt:
          nextStatus === MessageStatus.DEAD_LETTER ? new Date() : undefined,
      });

      this.logger.error(
        JSON.stringify({
          event:
            nextStatus === MessageStatus.DEAD_LETTER
              ? 'sms_dead_letter'
              : 'sms_send_failed_retryable',
          messageId,
          tenantId: latest.tenantId,
          recipient: latest.recipient,
          retryCount: nextRetryCount,
          maxRetries: SMS_MAX_RETRIES,
          isPermanent,
          retriesExhausted,
          nextStatus,
          failureType,
          errorMessage,
        }),
      );

      if (nextStatus === MessageStatus.DEAD_LETTER) {
        await this.recordCampaignFailureIfNeeded(latest);

        return {
          success: false,
          messageId,
          deadLetter: true,
          failureType,
          errorMessage,
        };
      }

      throw error;
    }
  }

  private isRetryableProviderFailure(failureType?: string | null) {
    return (
      failureType === 'temporary' ||
      failureType === 'rate_limit' ||
      failureType === 'unknown' ||
      !failureType
    );
  }

  private isPermanentFailure(error: unknown) {
    const message =
      error instanceof Error
        ? error.message.toLowerCase()
        : String(error).toLowerCase();

    const permanentPatterns = [
      'invalid phone',
      'invalid recipient',
      'invalid number',
      'bad phone',
      'blacklisted',
      'blocked',
      'opted out',
      'unsubscribed',
      'insufficient quota',
      'quota exceeded',
      'tenant is suspended',
      'tenant is expired',
      'subscription expired',
      'message content blocked',
      'forbidden',
      'unauthorized',
    ];

    return permanentPatterns.some((pattern) => message.includes(pattern));
  }

  private async recordCampaignFailureIfNeeded(message: SmsMessage) {
    if (!message.campaignId) {
      return;
    }

    await this.campaignsService.recordMessageFailure(message.campaignId);
  }
}