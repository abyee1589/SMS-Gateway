import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ContactGroupsService } from './contact-groups.service';
import { CreateContactGroupDto } from './dto/create-contact-group.dto';
import { UpdateContactGroupMembersDto } from './dto/update-contact-group-members.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Controller('contact-groups')
@UseGuards(JwtAuthGuard)
export class ContactGroupsController {
  constructor(
    private readonly contactGroupsService: ContactGroupsService,
    private readonly auditLogsService: AuditLogsService
  ) {}

  @Post()
  async create(
    @Body() dto: CreateContactGroupDto,
    @Req() req: { user: { id: string; email: string; tenantId: string } },
  ) {
    const group = await this.contactGroupsService.create(dto, req.user);

    await this.auditLogsService.createLog({
      tenantId: req.user.tenantId,
      actorUserId: req.user.id,
      actorEmail: req.user.email,
      action: 'create_contact_group',
      entityType: 'contact_group',
      entityId: group.id,
      metadata: {
        name: group.name,
        description: group.description,
      },
    });

    return group;
  }

  @Get()
  findAll(@Req() req: { user: { tenantId: string } }) {
    return this.contactGroupsService.findAll(req.user.tenantId);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Req() req: { user: { tenantId: string } },
  ) {
    return this.contactGroupsService.findOne(id, req.user.tenantId);
  }

  @Patch(':id/members')
  async addMembers(
    @Param('id') id: string,
    @Body() dto: UpdateContactGroupMembersDto,
    @Req() req: { user: { id: string; email: string; tenantId: string } },
  ) {
    const group = await this.contactGroupsService.addMembers(
      id,
      req.user.tenantId,
      dto.contactIds,
    );

    await this.auditLogsService.createLog({
      tenantId: req.user.tenantId,
      actorUserId: req.user.id,
      actorEmail: req.user.email,
      action: 'add_group_members',
      entityType: 'contact_group',
      entityId: group.id,
      metadata: {
        addedContactIds: dto.contactIds,
        totalMembers: group.contacts.length,
      },
    });

    return group;
  }

  @Patch(':id/members/remove')
  async removeMembers(
    @Param('id') id: string,
    @Body() dto: UpdateContactGroupMembersDto,
    @Req() req: { user: { id: string; email: string; tenantId: string } },
  ) {
    const group = await this.contactGroupsService.removeMembers(
      id,
      req.user.tenantId,
      dto.contactIds,
    );

    await this.auditLogsService.createLog({
      tenantId: req.user.tenantId,
      actorUserId: req.user.id,
      actorEmail: req.user.email,
      action: 'remove_group_members',
      entityType: 'contact_group',
      entityId: group.id,
      metadata: {
        removedContactIds: dto.contactIds,
        totalMembers: group.contacts.length,
      },
    });

    return group;
  }
}