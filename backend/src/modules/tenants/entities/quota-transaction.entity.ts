import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum QuotaTransactionType {
  ALLOCATION = 'allocation',
  PURCHASE = 'purchase',
  USAGE = 'usage',
  REFUND = 'refund',
  ADJUSTMENT = 'adjustment',
}

@Entity('quota_transactions')
export class QuotaTransaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  tenantId!: string;

  @Column({
    type: 'enum',
    enum: QuotaTransactionType,
  })
  type!: QuotaTransactionType;

  @Column({ type: 'int' })
  amount!: number;

  @Column({ type: 'int' })
  balanceBefore!: number;

  @Column({ type: 'int' })
  balanceAfter!: number;

  @Column({ type: 'text', nullable: true })
  reason?: string | null;

  @Column({ type: 'varchar', nullable: true })
  referenceId?: string | null;

  @Column({ type: 'uuid', nullable: true })
  createdByUserId?: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}