import {
  Body,
  Controller,
  Get,
  Delete,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  ForbiddenException
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from './entities/user.entity';
import { AdminCreateUserDto } from './dto/admin-create-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly auditLogsService: AuditLogsService
  ) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  findAll(@Req() req: { user: { tenantId: string } }) {
    return this.usersService.findAll(req.user.tenantId);
  }


  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async create(
    @Body() dto: AdminCreateUserDto,
    @Req() req: { user: { id: string; email: string; tenantId: string } },
  ) {
      const user = await this.usersService.create({
        email: dto.email,
        password: dto.password,
        role: dto.role,
        tenantId: req.user.tenantId,
      });

      await this.auditLogsService.createLog({
        tenantId: req.user.tenantId,
        actorUserId: req.user.id,
        actorEmail: req.user.email,
        action: 'create_user',
        entityType: 'user',
        entityId: user.id,
        metadata: {
          createdEmail: user.email,
          role: user.role,
        },
      });

      return user;
    }

  @Delete(':id')
  async deleteUser(
    @Param('id') id: string,
    @Req()
    req: {
      user: {
        id: string;
        email: string;
        role: string;
        tenantId: string;
      };
    },
  ) {
    if (req.user.role !== 'super_admin') {
      throw new ForbiddenException('Only super admin can delete users');
    }

    const result = await this.usersService.deleteUser(id, req.user);

    await this.auditLogsService.createLog({
      tenantId: req.user.tenantId,
      actorUserId: req.user.id,
      actorEmail: req.user.email,
      action: 'delete_user',
      entityType: 'user',
      entityId: id,
    });

    return result;
  }
    

  @Patch(':id/role')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
    @Req() req: { user: { id: string; email: string; tenantId: string } },
  ) {
    const user = await this.usersService.updateRole(id, req.user.tenantId, dto.role);

    await this.auditLogsService.createLog({
      tenantId: req.user.tenantId,
      actorUserId: req.user.id,
      actorEmail: req.user.email,
      action: 'update_user_role',
      entityType: 'user',
      entityId: user.id,
      metadata: {
        newRole: user.role,
      },
    });

    return user;
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @Req() req: { user: { id: string; email: string; tenantId: string } },
  ) {
    const user = await this.usersService.updateStatus(
      id,
      req.user.tenantId,
      dto.isActive,
    );

    await this.auditLogsService.createLog({
      tenantId: req.user.tenantId,
      actorUserId: req.user.id,
      actorEmail: req.user.email,
      action: dto.isActive ? 'activate_user' : 'deactivate_user',
      entityType: 'user',
      entityId: user.id,
      metadata: {
        isActive: user.isActive,
      },
    });

    return user;
  }
}