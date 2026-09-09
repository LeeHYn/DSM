import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { FirebaseMessagingProvider } from './firebase-messaging.provider';
import { NotificationDispatcherService } from './notification-dispatcher.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    FirebaseMessagingProvider,
    NotificationDispatcherService,
  ],
})
export class NotificationsModule {}
