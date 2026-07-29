import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SubscriptionStatus, TenantStatus } from './tenant.entity';

@Entity('tenant_status_history')
export class TenantStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  tenantId!: string;

  @Column({
    type: 'enum',
    enum: TenantStatus,
    nullable: true,
  })
  previousStatus?: TenantStatus | null;

  @Column({
    type: 'enum',
    enum: TenantStatus,
  })
  newStatus!: TenantStatus;

  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    nullable: true,
  })
  previousSubscriptionStatus?: SubscriptionStatus | null;

  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
  })
  newSubscriptionStatus!: SubscriptionStatus;

  @Column({ type: 'text', nullable: true })
  reason?: string | null;

  @Column({ type: 'uuid', nullable: true })
  changedByUserId?: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
