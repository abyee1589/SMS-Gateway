import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Brackets, Repository } from 'typeorm';
import { Contact } from './entities/contact.entity';
import { CreateContactDto } from './dto/create-contact.dto';
import { QueryContactsDto } from './dto/query-contacts.dto';

type CurrentUser = {
  id: string;
  tenantId: string;
  role: string;
};

@Injectable()
export class ContactsService {
  constructor(
    @InjectRepository(Contact)
    private readonly contactsRepository: Repository<Contact>,
  ) {}

  async create(dto: CreateContactDto, currentUser: CurrentUser) {
    const existing = await this.contactsRepository.findOne({
      where: {
        tenantId: currentUser.tenantId,
        createdByUserId: currentUser.id,
        phone: dto.phone,
      },
    });

    if (existing) {
      throw new ConflictException(
        'A contact with this phone number already exists',
      );
    }

    const contact = this.contactsRepository.create({
      tenantId: currentUser.tenantId,
      createdByUserId: currentUser.id,
      phone: dto.phone,
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      isActive: true,
    });

    return this.contactsRepository.save(contact);
  }

  async findAll(query: QueryContactsDto, currentUser: CurrentUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.contactsRepository.createQueryBuilder('contact');

    qb.where('contact.tenantId = :tenantId', {
      tenantId: currentUser.tenantId,
    });

    if (currentUser.role === 'user') {
      qb.andWhere('contact.createdByUserId = :userId', {
        userId: currentUser.id,
      });
    }

    if (query.search) {
      qb.andWhere(
        new Brackets((subQb) => {
          subQb
            .where('contact.phone ILIKE :search', {
              search: `%${query.search}%`,
            })
            .orWhere('contact.firstName ILIKE :search', {
              search: `%${query.search}%`,
            })
            .orWhere('contact.lastName ILIKE :search', {
              search: `%${query.search}%`,
            })
            .orWhere('contact.email ILIKE :search', {
              search: `%${query.search}%`,
            });
        }),
      );
    }

    qb.orderBy('contact.createdAt', 'DESC');
    qb.skip((page - 1) * limit);
    qb.take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, currentUser: CurrentUser) {
    const contact = await this.contactsRepository.findOne({
      where: {
        id,
        tenantId: currentUser.tenantId,
      },
    });

    if (!contact) {
      throw new NotFoundException('Contact not found');
    }

    if (
      currentUser.role === 'user' &&
      contact.createdByUserId !== currentUser.id
    ) {
      throw new ForbiddenException('You can only access your own contacts');
    }

    return contact;
  }

  async importFromCsv(
    rows: Array<{
      phone?: string;
      firstName?: string;
      lastName?: string;
      email?: string;
    }>,
    currentUser: CurrentUser,
  ) {
    const cleanedRows = rows
      .map((row) => ({
        phone: row.phone?.trim(),
        firstName: row.firstName?.trim() || undefined,
        lastName: row.lastName?.trim() || undefined,
        email: row.email?.trim() || undefined,
      }))
      .filter((row) => row.phone);

    if (!cleanedRows.length) {
      return {
        imported: 0,
        skipped: 0,
        total: 0,
        errors: ['No valid rows found in CSV'],
      };
    }

    const phones = [...new Set(cleanedRows.map((row) => row.phone!))];

    const existingContacts = await this.contactsRepository.find({
      where: {
        tenantId: currentUser.tenantId,
        createdByUserId: currentUser.id,
        phone: In(phones),
      },
    });

    const existingPhones = new Set(
      existingContacts.map((contact) => contact.phone),
    );

    const newContacts = cleanedRows
      .filter((row) => !existingPhones.has(row.phone!))
      .map((row) =>
        this.contactsRepository.create({
          tenantId: currentUser.tenantId,
          createdByUserId: currentUser.id,
          phone: row.phone!,
          firstName: row.firstName,
          lastName: row.lastName,
          email: row.email,
          isActive: true,
        }),
      );

    if (newContacts.length) {
      await this.contactsRepository.save(newContacts);
    }

    return {
      imported: newContacts.length,
      skipped: cleanedRows.length - newContacts.length,
      total: cleanedRows.length,
      errors: [],
    };
  }
}