import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  Req,
  Patch,
} from '@nestjs/common';
import { Request } from 'express';

import { SmsService } from './sms.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { QueryMessagesDto } from './dto/query-messages.dto';
import { CreateBulkMessageDto } from './dto/create-bulk-message.dto';
import { UpdateScheduledMessageDto } from './dto/update-scheduled-message.dto';
import { QueryFailedMessagesDto } from './dto/query-failed-messages.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface RequestWithUser extends Request {
  user: {
    id: string;
    tenantId: string;
    role: string;
  };
}

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class SmsController {
  constructor(private readonly smsService: SmsService) {}

  @Post()
  create(@Body() dto: CreateMessageDto, @Req() req: RequestWithUser) {
    return this.smsService.createMessage(dto, req.user);
  }

  @Post('bulk')
  createBulk(@Body() dto: CreateBulkMessageDto, @Req() req: RequestWithUser) {
    return this.smsService.createBulkMessages(dto, req.user);
  }

  @Get()
  findAll(@Query() query: QueryMessagesDto, @Req() req: RequestWithUser) {
    return this.smsService.findAll(query, req.user);
  }

  @Get('stats/summary')
  getStats(@Req() req: RequestWithUser) {
    return this.smsService.getStats(req.user);
  }

  @Get('failed')
  findFailedMessages(
    @Query() query: QueryFailedMessagesDto,
    @Req() req: RequestWithUser,
  ) {
    return this.smsService.findFailedMessages(query, req.user);
  }

  @Get('dead-letter')
  findDeadLetterMessages(
    @Query() query: QueryFailedMessagesDto,
    @Req() req: RequestWithUser,
  ) {
    return this.smsService.findDeadLetterMessages(query, req.user);
  }

  @Patch(':id/retry')
  retryMessage(
    @Param('id') id: string,
    @Body() dto: Partial<CreateMessageDto>,
    @Req() req: RequestWithUser,
  ) {
    return this.smsService.retryMessage(id, req.user, dto);
  }

  @Patch(':id/cancel')
  cancelScheduledMessage(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.smsService.cancelScheduledMessage(id, req.user);
  }

  @Patch(':id/schedule')
  updateScheduledMessage(
    @Param('id') id: string,
    @Body() dto: UpdateScheduledMessageDto,
    @Req() req: RequestWithUser,
  ) {
    return this.smsService.updateScheduledMessage(id, dto, req.user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.smsService.findOne(id, req.user);
  }
}