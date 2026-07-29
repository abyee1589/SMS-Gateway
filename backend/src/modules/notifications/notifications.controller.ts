import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationsService } from './notifications.service';
import { QueryNotificationsDto } from './dto/query-notifications.dto';

type RequestUser = {
  id: string;
  tenantId: string;
  role: string;
};

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  findAll(
    @Query() query: QueryNotificationsDto,
    @Req() req: { user: RequestUser },
  ) {
    return this.notificationsService.findAll(query, req.user);
  }

  @Get('unread-count')
  getUnreadCount(@Req() req: { user: RequestUser }) {
    return this.notificationsService.getUnreadCount(req.user);
  }

  @Patch('read-all')
  markAllAsRead(@Req() req: { user: RequestUser }) {
    return this.notificationsService.markAllAsRead(req.user);
  }

  @Patch(':id/read')
  markAsRead(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    return this.notificationsService.markAsRead(id, req.user);
  }
}