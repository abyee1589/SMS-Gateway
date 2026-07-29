import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum MessageStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  PROCESSING = 'processing',
  SCHEDULED = 'scheduled',
  CANCELLED = 'cancelled',
  SENT = 'sent',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  DEAD_LETTER = 'dead_letter',
}

@Entity('messages')
export class SmsMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar' })
  tenantId!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  campaignId?: string | null;

  @Column({ type: 'uuid', nullable: true })
  createdByUserId?: string | null;

  @Column()
  recipient!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({
    type: 'enum',
    enum: MessageStatus,
    default: MessageStatus.PENDING,
  })
  status!: MessageStatus;

  @Column({ type: 'varchar', nullable: true })
  providerMessageId?: string | null;

  @Column({ type: 'varchar', nullable: true })
  providerName?: string | null;

  @Column({ type: 'varchar', nullable: true })
  providerStatus?: string | null;

  @Column({ type: 'varchar', nullable: true })
  providerErrorCode?: string | null;

  @Column({ type: 'varchar', nullable: true })
  failureType?: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage?: string | null;

  @Column({ default: 0 })
  retryCount!: number;

  @Column({ type: 'varchar', nullable: true, unique: true })
  idempotencyKey?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  scheduledAt?: Date | null;

  @Column({ type: 'varchar', nullable: true })
  scheduledJobId?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  sentAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  deliveredAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  deadLetteredAt?: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}