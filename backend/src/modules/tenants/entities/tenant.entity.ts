import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum TenantStatus {
  TRIAL = 'trial',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  EXPIRED = 'expired',
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  SUSPENDED = 'suspended',
  NONE = 'none',
}

export enum CommercialTier {
  STANDARD = 'standard',
  VIP = 'vip',
  ENTERPRISE = 'enterprise',
}

export enum MessagePriority {
  NORMAL = 'normal',
  HIGH = 'high',
  CRITICAL = 'critical',
}

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column()
  name!: string;

  @Column({ nullable: true })
  legalName?: string;

  @Column({ nullable: true })
  tinNumber?: string;

  @Column({ nullable: true })
  contactEmail?: string;

  @Column({ nullable: true })
  contactPhone?: string;

  @Column({
    type: 'enum',
    enum: TenantStatus,
    default: TenantStatus.ACTIVE,
  })
  status!: TenantStatus;

  @Column({
    type: 'enum',
    enum: CommercialTier,
    default: CommercialTier.STANDARD,
  })
  commercialTier!: CommercialTier;

  @Column({ type: 'int', default: 0 })
  discountPercent!: number;

  @Column({
    type: 'enum',
    enum: MessagePriority,
    default: MessagePriority.NORMAL,
  })
  messagePriority!: MessagePriority;

  @Column({ nullable: true })
  subscriptionPlanId?: string;

  @Column({ type: 'int', default: 0 })
  smsQuota!: number;

  @Column({ type: 'int', default: 0 })
  smsUsed!: number;

  @Column({ type: 'timestamp', nullable: true })
  subscriptionStartDate?: Date;

  @Column({ type: 'timestamp', nullable: true })
  subscriptionEndDate?: Date;

  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    default: SubscriptionStatus.NONE,
  })
  subscriptionStatus!: SubscriptionStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}