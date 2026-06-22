import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ContactGroup } from '../entities/contact-group.entity';
import { Contact } from '../entities/contact.entity';
import { CreateContactGroupDto } from '../dto/create-contact-group.dto';

type CurrentUser = {
  id: string;
  tenantId: string;
  role: string;
};

@Injectable()
export class ContactGroupsService {
  constructor(
    @InjectRepository(ContactGroup)
    private readonly groupsRepository: Repository<ContactGroup>,

    @InjectRepository(Contact)
    private readonly contactsRepository: Repository<Contact>,
  ) {}

  async create(dto: CreateContactGroupDto, currentUser: CurrentUser) {
    const existing = await this.groupsRepository.findOne({
      where: {
        tenantId: currentUser.tenantId,
        createdByUserId:
          currentUser.role === 'user' ? currentUser.id : undefined,
        name: dto.name,
      },
    });

    if (existing) {
      throw new ConflictException('A group with this name already exists');
    }

    const group = this.groupsRepository.create({
      tenantId: currentUser.tenantId,
      createdByUserId: currentUser.id,
      name: dto.name,
      description: dto.description,
      contacts: [],
    });

    return this.groupsRepository.save(group);
  }

  async findAll(currentUser: CurrentUser) {
    const where =
      currentUser.role === 'user'
        ? {
            tenantId: currentUser.tenantId,
            createdByUserId: currentUser.id,
          }
        : {
            tenantId: currentUser.tenantId,
          };

    return this.groupsRepository.find({
      where,
      relations: ['contacts'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, currentUser: CurrentUser) {
    const group = await this.groupsRepository.findOne({
      where: {
        id,
        tenantId: currentUser.tenantId,
      },
      relations: ['contacts'],
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    if (
      currentUser.role === 'user' &&
      group.createdByUserId !== currentUser.id
    ) {
      throw new ForbiddenException('You can only access your own groups');
    }

    return group;
  }

  async addMembers(id: string, currentUser: CurrentUser, contactIds: string[]) {
    const group = await this.findOne(id, currentUser);

    const contactWhere =
      currentUser.role === 'user'
        ? {
            id: In(contactIds),
            tenantId: currentUser.tenantId,
            createdByUserId: currentUser.id,
          }
        : {
            id: In(contactIds),
            tenantId: currentUser.tenantId,
          };

    const contacts = await this.contactsRepository.find({
      where: contactWhere,
    });

    if (contacts.length !== contactIds.length) {
      throw new ForbiddenException(
        'One or more contacts are not accessible to you',
      );
    }

    const existingIds = new Set(group.contacts.map((contact) => contact.id));
    const mergedContacts = [
      ...group.contacts,
      ...contacts.filter((contact) => !existingIds.has(contact.id)),
    ];

    group.contacts = mergedContacts;

    return this.groupsRepository.save(group);
  }

  async removeMembers(
    id: string,
    currentUser: CurrentUser,
    contactIds: string[],
  ) {
    const group = await this.findOne(id, currentUser);

    group.contacts = group.contacts.filter(
      (contact) => !contactIds.includes(contact.id),
    );

    return this.groupsRepository.save(group);
  }
}