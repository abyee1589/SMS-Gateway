import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { InboundMessage } from './entities/inbound-message.entity';
import { InboundMessagesController } from './inbound-messages.controller';
import { InboundMessagesService } from './inbound-messages.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    ConfigModule, TypeOrmModule.forFeature([InboundMessage]),
    NotificationsModule
  ],
  controllers: [InboundMessagesController],
  providers: [InboundMessagesService],
  exports: [InboundMessagesService],
})
export class InboundMessagesModule {}