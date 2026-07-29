import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';

import { MessageTemplate } from './entities/message-template.entity';
import { CreateMessageTemplateDto } from './dto/create-message-template.dto';
import { UpdateMessageTemplateDto } from './dto/update-message-template.dto';
import { QueryMessageTemplatesDto } from './dto/query-message-templates.dto';
import { PreviewMessageTemplateDto } from './dto/preview-message-template.dto';
import { Contact } from '../contacts/entities/contact.entity';

type CurrentUser = {
  id: string;
  tenantId: string;
  role: string;
};

@Injectable()
export class MessageTemplatesService {
  constructor(
    @InjectRepository(MessageTemplate)
    private readonly templatesRepository: Repository<MessageTemplate>,

    @InjectRepository(Contact)
    private readonly contactsRepository: Repository<Contact>,
  ) {}

  async create(dto: CreateMessageTemplateDto, currentUser: CurrentUser) {
    const template = this.templatesRepository.create({
      tenantId: currentUser.tenantId,
      createdByUserId: currentUser.id,
      name: dto.name.trim(),
      content: dto.content.trim(),
      description: dto.description?.trim() || null,
      isActive: dto.isActive ?? true,
    });

    return this.templatesRepository.save(template);
  }

  async findAll(query: QueryMessageTemplatesDto, currentUser: CurrentUser) {
    const qb = this.templatesRepository.createQueryBuilder('template');

    qb.where('template.tenantId = :tenantId', {
      tenantId: currentUser.tenantId,
    });

    if (currentUser.role === 'user') {
      qb.andWhere('template.createdByUserId = :userId', {
        userId: currentUser.id,
      });
    }

    if (query.isActive !== undefined) {
      qb.andWhere('template.isActive = :isActive', {
        isActive: query.isActive,
      });
    }

    if (query.search) {
      qb.andWhere(
        new Brackets((subQb) => {
          subQb
            .where('template.name ILIKE :search', {
              search: `%${query.search}%`,
            })
            .orWhere('template.content ILIKE :search', {
              search: `%${query.search}%`,
            })
            .orWhere('template.description ILIKE :search', {
              search: `%${query.search}%`,
            });
        }),
      );
    }

    qb.orderBy('template.createdAt', 'DESC');

    return qb.getMany();
  }

  async findOne(id: string, currentUser: CurrentUser) {
    const template = await this.templatesRepository.findOne({
      where: {
        id,
        tenantId: currentUser.tenantId,
      },
    });

    if (!template) {
      throw new NotFoundException('Message template not found');
    }

    if (
      currentUser.role === 'user' &&
      template.createdByUserId !== currentUser.id
    ) {
      throw new ForbiddenException('You can only access your own templates');
    }

    return template;
  }

  async update(
    id: string,
    dto: UpdateMessageTemplateDto,
    currentUser: CurrentUser,
  ) {
    const template = await this.findOne(id, currentUser);

    if (dto.name !== undefined) {
      template.name = dto.name.trim();
    }

    if (dto.content !== undefined) {
      template.content = dto.content.trim();
    }

    if (dto.description !== undefined) {
      template.description = dto.description.trim() || null;
    }

    if (dto.isActive !== undefined) {
      template.isActive = dto.isActive;
    }

    return this.templatesRepository.save(template);
  }

  async deactivate(id: string, currentUser: CurrentUser) {
    const template = await this.findOne(id, currentUser);

    template.isActive = false;

    return this.templatesRepository.save(template);
  }

  renderTemplate(
    content: string,
    contact: {
      firstName?: string | null;
      lastName?: string | null;
      phone?: string | null;
      email?: string | null;
    },
  ) {
    const firstName = contact.firstName || '';
    const lastName = contact.lastName || '';
    const fullName =
      `${firstName} ${lastName}`.trim() || contact.phone || '';

    const variables: Record<string, string> = {
      firstName,
      lastName,
      fullName,
      phone: contact.phone || '',
      email: contact.email || '',
    };

    return content.replace(
      /\{\{\s*(firstName|lastName|fullName|phone|email)\s*\}\}/g,
      (_, key: string) => variables[key] ?? '',
    );
  }

  async preview(dto: PreviewMessageTemplateDto, currentUser: CurrentUser) {
    let content = dto.content?.trim();

    if (dto.templateId) {
      const template = await this.findOne(dto.templateId, currentUser);

      if (!template.isActive) {
        throw new BadRequestException('Message template is inactive');
      }

      content = template.content.trim();
    }

    if (!content) {
      throw new BadRequestException('Either templateId or content is required');
    }

    const contact = await this.contactsRepository.findOne({
      where: {
        id: dto.contactId,
        tenantId: currentUser.tenantId,
        ...(currentUser.role === 'user'
          ? { createdByUserId: currentUser.id }
          : {}),
      },
    });

    if (!contact) {
      throw new BadRequestException('Contact not found');
    }

    const fullName =
      [contact.firstName, contact.lastName].filter(Boolean).join(' ') ||
      contact.phone ||
      '';

    const rendered = this.renderTemplate(content, contact);

    return {
      templateId: dto.templateId ?? null,
      contactId: contact.id,
      rendered,
      variables: {
        firstName: contact.firstName ?? '',
        lastName: contact.lastName ?? '',
        fullName,
        phone: contact.phone ?? '',
        email: contact.email ?? '',
      },
    };
  }
}