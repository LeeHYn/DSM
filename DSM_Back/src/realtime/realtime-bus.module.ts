import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RealtimeBusService } from './realtime-bus.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [RealtimeBusService],
  exports: [RealtimeBusService],
})
export class RealtimeBusModule {}
