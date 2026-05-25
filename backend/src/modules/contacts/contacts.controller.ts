import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  BadRequestException,
  UploadedFile,
  UseInterceptors,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { parse } from 'csv-parse/sync';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { QueryContactsDto } from './dto/query-contacts.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

type CurrentUser = {
  id: string;
  email: string;
  tenantId: string;
  role: string;
};

@Controller('contacts')
@UseGuards(JwtAuthGuard)
export class ContactsController {
  private readonly logger = new Logger(ContactsController.name);

  constructor(
    private readonly contactsService: ContactsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  @Post()
  async create(
    @Body() dto: CreateContactDto,
    @Req() req: { user: CurrentUser },
  ) {
    const contact = await this.contactsService.create(dto, req.user);

    await this.auditLogsService.createLog({
      tenantId: req.user.tenantId,
      actorUserId: req.user.id,
      actorEmail: req.user.email,
      action: 'create_contact',
      entityType: 'contact',
      entityId: contact.id,
      metadata: {
        phone: contact.phone,
        email: contact.email,
        firstName: contact.firstName,
        lastName: contact.lastName,
      },
    });

    return contact;
  }

  @Get()
  findAll(
    @Query() query: QueryContactsDto,
    @Req() req: { user: CurrentUser },
  ) {
    return this.contactsService.findAll(query, req.user);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Req() req: { user: CurrentUser },
  ) {
    return this.contactsService.findOne(id, req.user);
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async importCsv(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: { user: CurrentUser },
  ) {
    if (!file) {
      throw new BadRequestException('CSV file is required');
    }

    const content = file.buffer.toString('utf-8');

    let records: Array<{
      phone?: string;
      firstName?: string;
      lastName?: string;
      email?: string;
    }> = [];

    try {
      const parsed = parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as Record<string, string>[];

      records = parsed.map((row) => ({
        phone: row.phone || row.Phone || row.PHONE,
        firstName:
          row.firstName ||
          row.first_name ||
          row.FirstName ||
          row['first name'],
        lastName:
          row.lastName ||
          row.last_name ||
          row.LastName ||
          row['last name'],
        email: row.email || row.Email || row.EMAIL,
      }));
    } catch {
      throw new BadRequestException('Invalid CSV format');
    }

    const result = await this.contactsService.importFromCsv(records, req.user);

    this.logger.log(
      JSON.stringify({
        event: 'contacts_csv_import',
        tenantId: req.user.tenantId,
        createdByUserId: req.user.id,
        actorUserId: req.user.id,
        actorEmail: req.user.email,
        imported: result.imported,
        skipped: result.skipped,
        total: result.total,
        filename: file.originalname,
      }),
    );

    await this.auditLogsService.createLog({
      tenantId: req.user.tenantId,
      actorUserId: req.user.id,
      actorEmail: req.user.email,
      action: 'import_contacts_csv',
      entityType: 'contact',
      metadata: {
        total: result.total,
        imported: result.imported,
        skipped: result.skipped,
        errors: result.errors?.length ?? 0,
        filename: file.originalname,
      },
    });

    return result;
  }
}