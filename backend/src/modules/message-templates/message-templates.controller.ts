import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MessageTemplatesService } from './message-templates.service';
import { CreateMessageTemplateDto } from './dto/create-message-template.dto';
import { UpdateMessageTemplateDto } from './dto/update-message-template.dto';
import { QueryMessageTemplatesDto } from './dto/query-message-templates.dto';
import { PreviewMessageTemplateDto } from './dto/preview-message-template.dto';

type CurrentUser = {
  id: string;
  tenantId: string;
  role: string;
};

@Controller('message-templates')
@UseGuards(JwtAuthGuard)
export class MessageTemplatesController {
  constructor(
    private readonly messageTemplatesService: MessageTemplatesService,
  ) {}

  @Post()
  create(
    @Body() dto: CreateMessageTemplateDto,
    @Req() req: { user: CurrentUser },
  ) {
    return this.messageTemplatesService.create(dto, req.user);
  }

  @Get()
  findAll(
    @Query() query: QueryMessageTemplatesDto,
    @Req() req: { user: CurrentUser },
  ) {
    return this.messageTemplatesService.findAll(query, req.user);
  }

  @Post('preview')
  preview(
    @Body() dto: PreviewMessageTemplateDto,
    @Req() req: { user: CurrentUser },
  ) {
    return this.messageTemplatesService.preview(dto, req.user);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Req() req: { user: CurrentUser },
  ) {
    return this.messageTemplatesService.findOne(id, req.user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMessageTemplateDto,
    @Req() req: { user: CurrentUser },
  ) {
    return this.messageTemplatesService.update(id, dto, req.user);
  }

  @Patch(':id/deactivate')
  deactivate(
    @Param('id') id: string,
    @Req() req: { user: CurrentUser },
  ) {
    return this.messageTemplatesService.deactivate(id, req.user);
  }
}