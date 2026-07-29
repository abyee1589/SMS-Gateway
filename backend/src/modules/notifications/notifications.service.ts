import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import {
  Notification,
  NotificationStatus,
  NotificationType,
} from './entities/notification.entity';
import { QueryNotificationsDto } from './dto/query-notifications.dto';

type CurrentUser = {
  id: string;
  tenantId: string;
  role: string;
};

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationsRepository: Repository<Notification>,
  ) {}

  async create(input: {
    tenantId: string;
    userId?: string | null;
    type: NotificationType;
    title: string;
    message: string;
    actionUrl?: string | null;
    metadata?: Record<string, unknown> | null;
  }) {
    const notification = this.notificationsRepository.create({
      tenantId: input.tenantId,
      userId: input.userId ?? null,
      type: input.type,
      title: input.title,
      message: input.message,
      actionUrl: input.actionUrl ?? null,
      metadata: input.metadata ?? null,
      status: NotificationStatus.UNREAD,
    });

    return this.notificationsRepository.save(notification);
  }

  async createOnce(input: {
    tenantId: string;
    userId?: string | null;
    type: NotificationType;
    title: string;
    message: string;
    actionUrl?: string | null;
    metadata?: Record<string, unknown> | null;
    dedupeKey: string;
    }) {
    const existing = await this.notificationsRepository
        .createQueryBuilder('notification')
        .where('notification.tenantId = :tenantId', {
        tenantId: input.tenantId,
        })
        .andWhere(
        input.userId
            ? 'notification.userId = :userId'
            : 'notification.userId IS NULL',
        input.userId ? { userId: input.userId } : {},
        )
        .andWhere('notification.type = :type', {
        type: input.type,
        })
        .andWhere("notification.metadata ->> 'dedupeKey' = :dedupeKey", {
        dedupeKey: input.dedupeKey,
        })
        .getOne();

    if (existing) {
        return existing;
    }

    return this.create({
        tenantId: input.tenantId,
        userId: input.userId ?? null,
        type: input.type,
        title: input.title,
        message: input.message,
        actionUrl: input.actionUrl ?? null,
        metadata: {
        ...(input.metadata ?? {}),
        dedupeKey: input.dedupeKey,
        },
    });
    }

  async findAll(query: QueryNotificationsDto, currentUser: CurrentUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.notificationsRepository
      .createQueryBuilder('notification')
      .where('notification.tenantId = :tenantId', {
        tenantId: currentUser.tenantId,
      });

    if (currentUser.role === 'user') {
      qb.andWhere(
        '(notification.userId IS NULL OR notification.userId = :userId)',
        {
          userId: currentUser.id,
        },
      );
    }

    if (query.status) {
      qb.andWhere('notification.status = :status', {
        status: query.status,
      });
    }

    if (query.type) {
      qb.andWhere('notification.type = :type', {
        type: query.type,
      });
    }

    qb.orderBy('notification.createdAt', 'DESC');
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

  async getUnreadCount(currentUser: CurrentUser) {
    const where =
      currentUser.role === 'user'
        ? [
            {
              tenantId: currentUser.tenantId,
              userId: currentUser.id,
              status: NotificationStatus.UNREAD,
            },
            {
              tenantId: currentUser.tenantId,
              userId: IsNull(),
              status: NotificationStatus.UNREAD,
            },
          ]
        : {
            tenantId: currentUser.tenantId,
            status: NotificationStatus.UNREAD,
          };

    const count = await this.notificationsRepository.count({ where });

    return { count };
  }

  async markAsRead(id: string, currentUser: CurrentUser) {
    const notification = await this.findAccessibleNotification(id, currentUser);

    if (notification.status === NotificationStatus.READ) {
      return notification;
    }

    await this.notificationsRepository.update(notification.id, {
      status: NotificationStatus.READ,
      readAt: new Date(),
    });

    return this.findAccessibleNotification(notification.id, currentUser);
  }

  async markAllAsRead(currentUser: CurrentUser) {
    const qb = this.notificationsRepository
      .createQueryBuilder()
      .update(Notification)
      .set({
        status: NotificationStatus.READ,
        readAt: new Date(),
      })
      .where('tenantId = :tenantId', {
        tenantId: currentUser.tenantId,
      })
      .andWhere('status = :status', {
        status: NotificationStatus.UNREAD,
      });

    if (currentUser.role === 'user') {
      qb.andWhere('(userId IS NULL OR userId = :userId)', {
        userId: currentUser.id,
      });
    }

    const result = await qb.execute();

    return {
      updated: result.affected ?? 0,
    };
  }

  private async findAccessibleNotification(id: string, currentUser: CurrentUser) {
    const notification = await this.notificationsRepository.findOne({
      where: {
        id,
        tenantId: currentUser.tenantId,
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (
      currentUser.role === 'user' &&
      notification.userId &&
      notification.userId !== currentUser.id
    ) {
      throw new NotFoundException('Notification not found');
    }

    return notification;
  }
}