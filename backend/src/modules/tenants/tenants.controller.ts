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
import { TenantsService } from './tenants.service';
import { SubscribeTenantDto } from './dto/subscribe-dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Controller('tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN)
  findAll() {
    return this.tenantsService.findAll();
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.create(dto);
  }

  @Get('me')
  getMyTenant(@Req() req: { user: { tenantId: string } }) {
    return this.tenantsService.findById(req.user.tenantId);
  }

  @Get('me/quota-transactions')
  getMyQuotaTransactions(@Req() req: { user: { tenantId: string } }) {
    return this.tenantsService.getQuotaTransactions(req.user.tenantId);
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN)
  findOne(@Param('id') id: string) {
    return this.tenantsService.findById(id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.tenantsService.update(id, dto);
  }

  @Patch(':id/subscribe')
  @Roles(UserRole.SUPER_ADMIN)
    subscribeTenant(
      @Param('id') tenantId: string,
      @Body() dto: SubscribeTenantDto,
      @Req() req: { user: { id: string } },
    ) {
      return this.tenantsService.assignPlan(tenantId, dto.planId, req.user.id);
    }

  @Patch(':id/quota/add')
  @Roles(UserRole.SUPER_ADMIN)
  addQuota(
    @Param('id') tenantId: string,
    @Body() dto: { amount: number; reason?: string },
    @Req() req: { user: { id: string } },
  ) {
    return this.tenantsService.addQuota(
      tenantId,
      Number(dto.amount),
      req.user.id,
      dto.reason,
    );
  }

  @Get(':id/quota-transactions')
  @Roles(UserRole.SUPER_ADMIN)
  getQuotaTransactions(@Param('id') tenantId: string) {
    return this.tenantsService.getQuotaTransactions(tenantId);
  }
}