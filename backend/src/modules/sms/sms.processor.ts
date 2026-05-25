import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Logger } from '@nestjs/common';
import { SmsMessage, MessageStatus } from './entities/sms.entity';
import { TenantsService } from '../tenants/tenants.service';
import {
  SMS_MAX_RETRIES,
  SMS_QUEUE,
} from './constants/sms.constants';
import { SmsProviderFactory } from './providers/sms-provider.factory';

interface SmsJobData {
  messageId: string;
  recipient: string;
  content: string;
  idempotencyKey?: string;
}

@Processor(SMS_QUEUE)
export class SmsProcessor extends WorkerHost {
  private readonly logger = new Logger(SmsProcessor.name);

  constructor(
    @InjectRepository(SmsMessage)
    private readonly smsRepository: Repository<SmsMessage>,
    private readonly smsProviderFactory: SmsProviderFactory,
    private readonly tenantsService: TenantsService,
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

    try {
      await this.smsRepository.update(messageId, {
        status: MessageStatus.PROCESSING,
      });
      await this.tenantsService.assertCanSendMessages(message.tenantId, 1);

      const provider = this.smsProviderFactory.getProvider();
      const providerName = this.smsProviderFactory.getProviderName();

      const providerResponse = await provider.sendSms({
        recipient,
        content,
        idempotencyKey,
      });

      if (providerResponse.normalizedStatus === 'failed') {
        const retryable =
          providerResponse.failureType === 'temporary' ||
          providerResponse.failureType === 'rate_limit' ||
          providerResponse.failureType === 'unknown';

        const nextRetryCount = (message.retryCount ?? 0) + 1;
        const retriesExhausted = nextRetryCount >= SMS_MAX_RETRIES;

        if (retryable && retriesExhausted) {
          await this.smsRepository.update(messageId, {
            status: MessageStatus.DEAD_LETTER,
            providerName,
            providerStatus: providerResponse.rawStatus,
            providerErrorCode: providerResponse.errorCode,
            errorMessage: providerResponse.errorMessage,
            failureType: providerResponse.failureType,
            retryCount: nextRetryCount,
            deadLetteredAt: new Date(),
          });

          this.logger.error(
            JSON.stringify({
              event: 'sms_dead_letter',
              messageId,
              providerName,
              tenantId: message.tenantId,
              retryCount: nextRetryCount,
              failureType: providerResponse.failureType ?? 'unknown',
              providerErrorCode: providerResponse.errorCode ?? null,
              errorMessage: providerResponse.errorMessage ?? null,
            }),
          );

          return {
            success: false,
            messageId,
            deadLetter: true,
          };
        }

        await this.smsRepository.update(messageId, {
          status: MessageStatus.FAILED,
          providerName,
          providerStatus: providerResponse.rawStatus,
          providerErrorCode: providerResponse.errorCode,
          errorMessage: providerResponse.errorMessage,
          failureType: providerResponse.failureType,
          retryCount: nextRetryCount,
        });

        this.logger.error(
          JSON.stringify({
            event: 'sms_send_failed',
            messageId,
            providerName,
            providerStatus: providerResponse.rawStatus ?? null,
            providerErrorCode: providerResponse.errorCode ?? null,
            failureType: providerResponse.failureType ?? 'unknown',
            tenantId: message.tenantId,
            retryCount: (message.retryCount ?? 0) + 1,
            errorMessage: providerResponse.errorMessage ?? null,
          }),
        );

        if (retryable) {
          throw new Error(
            providerResponse.errorMessage || 'Retryable SMS failure',
          );
        }

        return {
          success: false,
          messageId,
          retryable: false,
        };
      }

      const latestBeforeSuccess = await this.smsRepository.findOne({
        where: { id: messageId },
      });

      await this.smsRepository.update(messageId, {
        status: MessageStatus.SENT,
        providerMessageId: providerResponse.providerMessageId,
        providerName,
        providerStatus: providerResponse.rawStatus,
        providerErrorCode: providerResponse.errorCode,
        errorMessage: undefined,
        failureType: undefined,
        sentAt: providerResponse.acceptedAt || new Date(),
      });

      if (latestBeforeSuccess?.status !== MessageStatus.SENT) {
        await this.tenantsService.incrementSmsUsage(message.tenantId, 1);
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

      return { success: true, messageId };
    } catch (error) {
      const latest = await this.smsRepository.findOne({
        where: { id: messageId },
      });

      if (
        latest &&
        latest.status !== MessageStatus.FAILED &&
        latest.status !== MessageStatus.DEAD_LETTER
      ) {
        const nextRetryCount = (latest.retryCount ?? 0) + 1;

        await this.smsRepository.update(messageId, {
          status:
            nextRetryCount >= SMS_MAX_RETRIES
              ? MessageStatus.DEAD_LETTER
              : MessageStatus.FAILED,
          errorMessage:
            error instanceof Error ? error.message : 'Unknown send error',
          retryCount: nextRetryCount,
          failureType: latest.failureType || 'unknown',
          deadLetteredAt:
            nextRetryCount >= SMS_MAX_RETRIES ? new Date() : undefined,
        });
      }
      throw error;
    }
  }
}