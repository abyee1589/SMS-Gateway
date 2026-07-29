import {
  Body,
  Controller,
  Get,
  Headers,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UseGuards } from '@nestjs/common';
import { InboundMessagesService } from './inbound-messages.service';
import { CreateInboundMessageDto } from './dto/create-inbound-message.dto';
import { QueryInboundMessagesDto } from './dto/query-inbound-messages.dto';

type RequestUser = {
  id: string;
  tenantId: string;
  role: string;
};

@Controller('inbound-messages')
export class InboundMessagesController {
  private readonly logger = new Logger(InboundMessagesController.name);

  constructor(
    private readonly inboundMessagesService: InboundMessagesService,
    private readonly configService: ConfigService,
  ) {}

  @Post('webhook')
  async receiveInboundSms(
    @Body() body: any,
    @Headers('x-webhook-secret') secret: string,
    @Headers('x-tenant-id') tenantIdFromHeader: string,
  ) {
    const webhookSecret = this.configService.get<string>('SMS_WEBHOOK_SECRET');

    if (!webhookSecret) {
      throw new UnauthorizedException('Webhook secret is not configured');
    }

    if (secret !== webhookSecret) {
      this.logger.warn(
        JSON.stringify({
          event: 'inbound_sms_webhook_unauthorized',
          receivedSecret: secret ?? null,
        }),
      );

      throw new UnauthorizedException('Invalid webhook secret');
    }

    const tenantId =
      tenantIdFromHeader ||
      body?.tenantId ||
      body?.tenant_id ||
      body?.accountId ||
      body?.account_id;

    if (!tenantId) {
      return {
        received: true,
        ignored: true,
        reason: 'missing_tenant_id',
      };
    }

    const from = body?.from || body?.sender || body?.msisdn || body?.phone;
    const to = body?.to || body?.receiver || body?.shortCode || body?.short_code;
    const content = body?.content || body?.message || body?.text || body?.body;

    if (!from || !content) {
      return {
        received: true,
        ignored: true,
        reason: 'missing_from_or_content',
      };
    }

    const inboundMessage = await this.inboundMessagesService.createFromWebhook({
      tenantId,
      dto: {
        from,
        to,
        content,
        providerName: body?.providerName || body?.provider || 'unknown',
        providerMessageId:
          body?.providerMessageId ||
          body?.messageId ||
          body?.message_id ||
          body?.id,
      } satisfies CreateInboundMessageDto,
      rawPayload: body,
    });

    return {
      received: true,
      messageId: inboundMessage.id,
      status: inboundMessage.status,
    };
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(
    @Query() query: QueryInboundMessagesDto,
    @Req() req: { user: RequestUser },
  ) {
    return this.inboundMessagesService.findAll(query, req.user);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    return this.inboundMessagesService.findOne(id, req.user);
  }

  @Patch(':id/read')
  @UseGuards(JwtAuthGuard)
  markAsRead(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    return this.inboundMessagesService.markAsRead(id, req.user);
  }

  @Patch(':id/archive')
  @UseGuards(JwtAuthGuard)
  archive(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    return this.inboundMessagesService.archive(id, req.user);
  }
}