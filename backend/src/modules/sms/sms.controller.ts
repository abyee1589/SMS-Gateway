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
import { SmsService } from './sms.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { QueryMessagesDto } from './dto/query-messages.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';

// Define the shape of the user coming from your Auth Guard
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
  create(
    @Body() dto: CreateMessageDto,
    @Req() req: RequestWithUser,
  ) {
    // Passes full user context for creation and quota checks
    return this.smsService.createMessage(dto, req.user);
  }

  @Get()
  findAll(
    @Query() query: QueryMessagesDto,
    @Req() req: RequestWithUser,
  ) {
    // Passes user context to filter results based on role
    return this.smsService.findAll(query, req.user);
  }

  @Get('stats/summary')
  getStats(@Req() req: RequestWithUser) {
    // Passes user context so stats are scoped to the user's view
    return this.smsService.getStats(req.user);
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
  cancelScheduledMessage(
    @Param('id') id: string,
    @Req() req: RequestWithUser,
  ) {
    return this.smsService.cancelScheduledMessage(id, req.user);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Req() req: RequestWithUser,
  ) {
    // Passes user context to prevent unauthorized access to specific IDs
    return this.smsService.findOne(id, req.user);
  }
}