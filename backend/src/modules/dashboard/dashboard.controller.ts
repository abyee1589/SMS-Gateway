import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

type CurrentUser = {
  id: string;
  tenantId: string;
  role: string;
};

type DashboardPeriod = 'today' | 'week' | 'month' | 'year';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  getStats(
    @Req()
    req: {
      user: CurrentUser;
    },
    @Query('period') period: DashboardPeriod = 'month',
  ) {
    return this.dashboardService.getStats(req.user, period);
  }
}