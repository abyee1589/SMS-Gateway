import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Contact } from '../../contacts/entities/contact.entity';

@Entity('contact_groups')
export class ContactGroup {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column()
  tenantId!: string;

  @Column()
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @ManyToMany(() => Contact)
  @JoinTable({
    name: 'contact_group_members',
    joinColumn: {
      name: 'groupId',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'contactId',
      referencedColumnName: 'id',
    },
  })
  contacts!: Contact[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}