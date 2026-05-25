import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

type CreateAuditLogInput = {
  tenantId: string;
  actorUserId: string;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class AuditLogsService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogsRepository: Repository<AuditLog>,
  ) {}

  async createLog(input: CreateAuditLogInput) {
    const log = this.auditLogsRepository.create({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata,
    });

    return this.auditLogsRepository.save(log);
  }

  async findAll(tenantId: string) {
    return this.auditLogsRepository.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }
}