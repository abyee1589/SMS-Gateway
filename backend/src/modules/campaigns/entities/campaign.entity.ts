import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum CampaignStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('campaigns')
export class Campaign {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column()
  tenantId!: string;

  @Column()
  name!: string;

  @Column({ type: 'text' })
  message!: string;

  @Column({
    type: 'enum',
    enum: CampaignStatus,
    default: CampaignStatus.DRAFT,
  })
  status!: CampaignStatus;

  @Column({ default: 0 })
  totalRecipients!: number;

  @Column({ default: 0 })
  sentCount!: number;

  @Column({ default: 0 })
  failedCount!: number;

  @Column({ type: 'timestamp', nullable: true })
  scheduledAt?: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({nullable: true})
  createdByUserId!: string;
}