import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ContactGroup } from './entities/contact-group.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { CreateContactGroupDto } from './dto/create-contact-group.dto';

@Injectable()
export class ContactGroupsService {
  constructor(
    @InjectRepository(ContactGroup)
    private readonly groupsRepository: Repository<ContactGroup>,
    @InjectRepository(Contact)
    private readonly contactsRepository: Repository<Contact>,
  ) {}

  async create(
    dto: CreateContactGroupDto,
    currentUser: { tenantId: string },
  ) {
    const existing = await this.groupsRepository.findOne({
      where: {
        tenantId: currentUser.tenantId,
        name: dto.name,
      },
    });

    if (existing) {
      throw new ConflictException('A group with this name already exists');
    }

    const group = this.groupsRepository.create({
      tenantId: currentUser.tenantId,
      name: dto.name,
      description: dto.description,
      contacts: [],
    });

    return this.groupsRepository.save(group);
  }

  async findAll(tenantId: string) {
    return this.groupsRepository.find({
      where: { tenantId },
      relations: ['contacts'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, tenantId: string) {
    const group = await this.groupsRepository.findOne({
      where: { id, tenantId },
      relations: ['contacts'],
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    return group;
  }

  async addMembers(id: string, tenantId: string, contactIds: string[]) {
    const group = await this.findOne(id, tenantId);

    const contacts = await this.contactsRepository.find({
      where: {
        id: In(contactIds),
        tenantId,
      },
    });

    const existingIds = new Set(group.contacts.map((contact) => contact.id));
    const mergedContacts = [
      ...group.contacts,
      ...contacts.filter((contact) => !existingIds.has(contact.id)),
    ];

    group.contacts = mergedContacts;

    return this.groupsRepository.save(group);
  }

  async removeMembers(id: string, tenantId: string, contactIds: string[]) {
    const group = await this.findOne(id, tenantId);

    group.contacts = group.contacts.filter(
      (contact) => !contactIds.includes(contact.id),
    );

    return this.groupsRepository.save(group);
  }
}