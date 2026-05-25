import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CampaignsService } from './campaigns.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { QueryCampaignsDto } from './dto/query-campaigns.dto';

@Controller('campaigns')
@UseGuards(JwtAuthGuard)
export class CampaignsController {
  private readonly logger = new Logger(CampaignsController.name);

  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  // @Post()
  // async create(
  //   @Body() dto: CreateCampaignDto,
  //   @Req() req: { user: { id: string; email: string; tenantId: string } },
  // ) {
  //   const campaign = await this.campaignsService.create(dto, req.user);
  @Post()
  async create(
    @Body() dto: CreateCampaignDto,
    // Add 'role: string' right here 👇
    @Req() req: { user: { id: string; email: string; tenantId: string; role: string } }, 
  ) {
    const campaign = await this.campaignsService.create(dto, req.user);

    await this.auditLogsService.createLog({
      tenantId: req.user.tenantId,
      actorUserId: req.user.id,
      actorEmail: req.user.email,
      action: 'create_campaign',
      entityType: 'campaign',
      entityId: campaign.id,
      metadata: {
        name: campaign.name,
        status: campaign.status,
        totalRecipients: campaign.totalRecipients,
        hasDirectContacts: !!dto.contactIds?.length,
        hasGroups: !!dto.groupIds?.length,
        scheduledAt: dto.scheduledAt ?? null,
      },
    });

    this.logger.log(
      JSON.stringify({
        event: 'campaign_created',
        campaignId: campaign.id,
        tenantId: req.user.tenantId,
        actorUserId: req.user.id,
        actorEmail: req.user.email,
        totalRecipients: campaign.totalRecipients,
        status: campaign.status,
      }),
    );

    return campaign;
  }

//   @Get()
//   findAll(
//     @Query() query: QueryCampaignsDto,
//     @Req() req: { user: { tenantId: string } },
//   ) {
//     return this.campaignsService.findAll(query, req.user.tenantId);
//   }

//   @Get(':id')
//   findOne(
//     @Param('id') id: string,
//     @Req() req: { user: { tenantId: string } },
//   ) {
//     return this.campaignsService.findOne(id, req.user.tenantId);
//   }
  @Get()
  findAll(
    @Query() query: QueryCampaignsDto,
    // Add 'id' and 'role' to the type here so it matches CurrentUser
    @Req() req: { user: { id: string; tenantId: string; role: string } }, 
  ) {
    // Pass the whole user object, not just the string
    return this.campaignsService.findAll(query, req.user); 
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Req() req: { user: { id: string; tenantId: string; role: string } },
  ) {
    // Pass the whole user object
    return this.campaignsService.findOne(id, req.user);
  }
}