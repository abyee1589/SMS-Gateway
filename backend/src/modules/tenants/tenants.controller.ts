import { 
  Controller, 
  Get, 
  Patch, 
  Param, 
  Body, 
  Req, 
  UseGuards 
} from '@nestjs/common';
import { TenantsService } from './tenants.service'; // Adjust path as needed
import { SubscribeTenantDto } from './dto/subscribe-dto'; // Adjust path as needed
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; // Adjust path to your JWT guard
import { RolesGuard } from '../auth/guards/roles.guard'; // Adjust path to your Roles guard
import { Roles } from '../auth/decorators/roles.decorator'; // Adjust path to your @Roles decorator
import { UserRole } from "../users/entities/user.entity";



@Controller('tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('me')
  getMyTenant(@Req() req: { user: { tenantId: string } }) {
    return this.tenantsService.findById(req.user.tenantId);
  }

  @Patch(':id/subscribe')
  @Roles(UserRole.MANAGER)
  subscribeTenant(
    @Param('id') tenantId: string,
    @Body() dto: SubscribeTenantDto,
  ) {
    return this.tenantsService.assignPlan(tenantId, dto.planId);
  }
}