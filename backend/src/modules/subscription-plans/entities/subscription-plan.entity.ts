import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum SubscriptionPlanStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('subscription_plans')
export class SubscriptionPlan {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  name!: string;

  @Column({ type: 'int' })
  smsQuota!: number;

  @Column({ type: 'int', default: 30 })
  durationDays!: number;

  @Column({ type: 'int', default: 0 })
  price!: number;

  @Column({
    type: 'enum',
    enum: SubscriptionPlanStatus,
    default: SubscriptionPlanStatus.ACTIVE,
  })
  status!: SubscriptionPlanStatus;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}