import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContactGroupsController } from './contact-groups.controller';
import { ContactGroupsService } from './contact-groups.service';
import { ContactGroup } from './entities/contact-group.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [TypeOrmModule.forFeature([ContactGroup, Contact]), AuditLogsModule],
  controllers: [ContactGroupsController],
  providers: [ContactGroupsService],
  exports: [ContactGroupsService],
})
export class ContactGroupsModule {}