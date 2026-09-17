import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RealtimeBusModule } from './realtime-bus.module';
import { RealtimeGateway } from './realtime.gateway';
import { ReminderSignalService } from './reminder-signal.service';

@Module({
  imports: [AuthModule, RealtimeBusModule],
  providers: [RealtimeGateway, ReminderSignalService],
})
export class RealtimeModule {}
