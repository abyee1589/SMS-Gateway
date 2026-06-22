import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type BillingNotificationType =
  | 'subscription_expiring_7_days'
  | 'subscription_expiring_3_days'
  | 'subscription_expiring_1_day'
  | 'subscription_expired'
  | 'sms_usage_reminder_75_percent'
  | 'sms_usage_critical_95_percent'
  | 'sms_usage_exhausted_100_percent';

@Entity('billing_notification_logs')
@Index(['tenantId', 'type', 'targetDate', 'recipientEmail'], { unique: true })
export class BillingNotificationLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  tenantId!: string;

  @Column()
  type!: BillingNotificationType;

  @Column({ type: 'date' })
  targetDate!: string;

  @Column()
  recipientEmail!: string;

  @Column({ default: true })
  sent!: boolean;

  @Column({ type: 'text', nullable: true })
  errorMessage?: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}

