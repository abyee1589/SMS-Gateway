import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity'; // The singular row definition
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  // 1. Register the User Entity so TypeORM can create the table in Postgres
  imports: [TypeOrmModule.forFeature([User]), AuditLogsModule],
  
  // 2. The "Front Desk" that handles incoming API requests
  controllers: [UsersController],
  
  // 3. The "Engine Room" where the logic (and password hashing) lives
  providers: [UsersService],
  
  // 4. Export it so AppModule can use it for the "Seed" logic
  exports: [UsersService],
})
export class UsersModule {} // Ensure the 's' is here!