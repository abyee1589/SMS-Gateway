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
  ForbiddenException,
  BadRequestException,
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

type RequestUser = {
  id: string;
  email: string;
  role: UserRole;
  tenantId: string;
};

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  findAll(@Req() req: { user: RequestUser }) {
    if (req.user.role === UserRole.SUPER_ADMIN) {
      return this.usersService.findAllForPlatform();
    }

    if (!req.user.tenantId) {
      throw new BadRequestException('Tenant is required');
    }

    return this.usersService.findAll(req.user.tenantId);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async create(
    @Body() dto: AdminCreateUserDto,
    @Req() req: { user: RequestUser },
  ) {
    let tenantId = req.user.tenantId;
    const role = dto.role ?? UserRole.USER;

    if (role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Super admin users cannot be created here');
    }

    if (req.user.role === UserRole.SUPER_ADMIN) {
      if (!dto.tenantId) {
        throw new BadRequestException('Company is required');
      }

      tenantId = dto.tenantId;
    } else {
      if (!req.user.tenantId) {
        throw new BadRequestException('Tenant is required');
      }

      if (![UserRole.ADMIN, UserRole.USER].includes(role)) {
        throw new ForbiddenException(
          'Company admins can only create company admins or users',
        );
      }

      tenantId = req.user.tenantId;
    }

    const user = await this.usersService.create({
      email: dto.email,
      password: dto.password,
      role,
      tenantId,
    });

    await this.auditLogsService.createLog({
      tenantId,
      actorUserId: req.user.id,
      actorEmail: req.user.email,
      action: 'create_user',
      entityType: 'user',
      entityId: user.id,
      metadata: {
        createdEmail: user.email,
        role: user.role,
        tenantId: user.tenantId,
      },
    });

    return user;
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  async deleteUser(
    @Param('id') id: string,
    @Req() req: { user: RequestUser },
  ) {
    const result = await this.usersService.deleteUserAsSuperAdmin(
      id,
      req.user.id,
    );

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
    @Req() req: { user: RequestUser },
  ) {
    if (dto.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Super admin role cannot be assigned here');
    }

    if (
      req.user.role !== UserRole.SUPER_ADMIN &&
      ![UserRole.ADMIN, UserRole.USER].includes(dto.role)
    ) {
      throw new ForbiddenException(
        'Company admins can only assign company admin or user role',
      );
    }

    const user =
      req.user.role === UserRole.SUPER_ADMIN
        ? await this.usersService.updateRoleAsSuperAdmin(id, dto.role)
        : await this.usersService.updateRole(id, req.user.tenantId, dto.role);

    await this.auditLogsService.createLog({
      tenantId: user.tenantId,
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
    @Req() req: { user: RequestUser },
  ) {
    if (id === req.user.id) {
      throw new BadRequestException('You cannot change your own status');
    }

    const user =
      req.user.role === UserRole.SUPER_ADMIN
        ? await this.usersService.updateStatusAsSuperAdmin(id, dto.isActive)
        : await this.usersService.updateStatus(
            id,
            req.user.tenantId,
            dto.isActive,
          );

    await this.auditLogsService.createLog({
      tenantId: user.tenantId,
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