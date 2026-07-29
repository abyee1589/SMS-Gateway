import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import {
  InboundMessage,
  InboundMessageStatus,
} from './entities/inbound-message.entity';
import { CreateInboundMessageDto } from './dto/create-inbound-message.dto';
import { QueryInboundMessagesDto } from './dto/query-inbound-messages.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';

type CurrentUser = {
  id: string;
  tenantId: string;
  role: string;
};

@Injectable()
export class InboundMessagesService {
  constructor(
    @InjectRepository(InboundMessage)
    private readonly inboundMessagesRepository: Repository<InboundMessage>,

    private readonly notificationsService: NotificationsService,
  ) {}

  async createFromWebhook(input: {
    tenantId: string;
    dto: CreateInboundMessageDto;
    rawPayload?: Record<string, unknown>;
  }) {
      const inboundMessage = this.inboundMessagesRepository.create({
        tenantId: input.tenantId,
        from: this.normalizePhone(input.dto.from),
        to: input.dto.to ? this.normalizePhone(input.dto.to) : undefined,
        content: input.dto.content.trim(),
        providerName: input.dto.providerName,
        providerMessageId: input.dto.providerMessageId,
        rawPayload: input.rawPayload,
        receivedAt: new Date(),
        status: InboundMessageStatus.RECEIVED,
      });

      const savedInboundMessage =
        await this.inboundMessagesRepository.save(inboundMessage);

      await this.notificationsService.create({
        tenantId: input.tenantId,
        type: NotificationType.INBOUND_MESSAGE,
        title: 'New inbound message',
        message: `New SMS received from ${savedInboundMessage.from}`,
        actionUrl: '/messages/inbound',
        metadata: {
          inboundMessageId: savedInboundMessage.id,
          from: savedInboundMessage.from,
          to: savedInboundMessage.to ?? null,
          providerName: savedInboundMessage.providerName ?? null,
        },
      });

      return savedInboundMessage;
    }

  async findAll(query: QueryInboundMessagesDto, currentUser: CurrentUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb =
      this.inboundMessagesRepository.createQueryBuilder('inboundMessage');

    qb.where('inboundMessage.tenantId = :tenantId', {
      tenantId: currentUser.tenantId,
    });

    if (query.status) {
      qb.andWhere('inboundMessage.status = :status', {
        status: query.status,
      });
    }

    if (query.from) {
      qb.andWhere('inboundMessage.from ILIKE :from', {
        from: `%${this.normalizePhone(query.from)}%`,
      });
    }

    if (query.to) {
      qb.andWhere('inboundMessage.to ILIKE :to', {
        to: `%${this.normalizePhone(query.to)}%`,
      });
    }

    if (query.search) {
      qb.andWhere(
        new Brackets((subQb) => {
          subQb
            .where('inboundMessage.from ILIKE :search', {
              search: `%${query.search}%`,
            })
            .orWhere('inboundMessage.to ILIKE :search', {
              search: `%${query.search}%`,
            })
            .orWhere('inboundMessage.content ILIKE :search', {
              search: `%${query.search}%`,
            })
            .orWhere('inboundMessage.providerMessageId ILIKE :search', {
              search: `%${query.search}%`,
            });
        }),
      );
    }

    qb.orderBy('inboundMessage.createdAt', 'DESC');
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
    const inboundMessage = await this.inboundMessagesRepository.findOne({
      where: {
        id,
        tenantId: currentUser.tenantId,
      },
    });

    if (!inboundMessage) {
      throw new NotFoundException('Inbound message not found');
    }

    return inboundMessage;
  }

  async markAsRead(id: string, currentUser: CurrentUser) {
    const inboundMessage = await this.findOne(id, currentUser);

    if (inboundMessage.status === InboundMessageStatus.ARCHIVED) {
      throw new ForbiddenException('Archived inbound messages cannot be marked as read');
    }

    await this.inboundMessagesRepository.update(inboundMessage.id, {
      status: InboundMessageStatus.READ,
    });

    return this.findOne(inboundMessage.id, currentUser);
  }

  async archive(id: string, currentUser: CurrentUser) {
    const inboundMessage = await this.findOne(id, currentUser);

    await this.inboundMessagesRepository.update(inboundMessage.id, {
      status: InboundMessageStatus.ARCHIVED,
    });

    return this.findOne(inboundMessage.id, currentUser);
  }

  private normalizePhone(phone: string) {
    const trimmed = phone.trim().replace(/\s+/g, '');

    if (trimmed.startsWith('+')) {
      return trimmed;
    }

    if (trimmed.startsWith('0')) {
      return `+251${trimmed.slice(1)}`;
    }

    if (trimmed.startsWith('251')) {
      return `+${trimmed}`;
    }

    if (trimmed.startsWith('9')) {
      return `+251${trimmed}`;
    }

    return trimmed;
  }
}