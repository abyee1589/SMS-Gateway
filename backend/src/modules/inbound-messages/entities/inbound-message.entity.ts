import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum InboundMessageStatus {
  RECEIVED = 'received',
  READ = 'read',
  ARCHIVED = 'archived',
}

@Entity('inbound_messages')
export class InboundMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column()
  tenantId!: string;

  @Column()
  from!: string;

  @Column({ nullable: true })
  to?: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({
    type: 'enum',
    enum: InboundMessageStatus,
    default: InboundMessageStatus.RECEIVED,
  })
  status!: InboundMessageStatus;

  @Column({ nullable: true })
  providerName?: string;

  @Column({ nullable: true })
  providerMessageId?: string;

  @Column({ type: 'jsonb', nullable: true })
  rawPayload?: Record<string, unknown>;

  @Column({ type: 'timestamp', nullable: true })
  receivedAt?: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}