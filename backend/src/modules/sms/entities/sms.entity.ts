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
  @Column()
  tenantId!: string;

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

  @Column({ nullable: true })
  providerMessageId?: string;

  @Column({ type: 'text', nullable: true })
  errorMessage?: string | null;

  @Column({ default: 0 })
  retryCount!: number;

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
    @Column({ nullable: true })
  providerName?: string;

  @Column({ type: 'varchar', nullable: true })
  providerStatus?: string | null;

  @Column({ type: 'varchar', nullable: true })
  providerErrorCode?: string | null;

  @Column({ type: 'varchar', nullable: true })
  failureType?: string | null;

  @Column({ nullable: true, unique: true })
  idempotencyKey?: string;

  @Column({ nullable: true })
  createdByUserId?: string;

  @Column({ type: 'timestamp', nullable: true })
  scheduledAt?: Date;

  @Column({ nullable: true })
  scheduledJobId?: string;
}