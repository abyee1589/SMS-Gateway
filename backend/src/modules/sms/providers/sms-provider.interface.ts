export type NormalizedSmsStatus =
  | 'accepted'
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'failed';

export type SmsFailureType =
  | 'temporary'
  | 'permanent'
  | 'auth'
  | 'rate_limit'
  | 'unknown';

export type SendSmsInput = {
  recipient: string;
  content: string;
  idempotencyKey?: string;
};

export type SendSmsResult = {
  providerMessageId?: string;
  normalizedStatus: NormalizedSmsStatus;
  rawStatus?: string;
  acceptedAt?: Date;
  errorCode?: string;
  errorMessage?: string;
  failureType?: SmsFailureType;
  raw?: unknown;
};

export interface SmsGatewayProvider {
  sendSms(input: SendSmsInput): Promise<SendSmsResult>;
}