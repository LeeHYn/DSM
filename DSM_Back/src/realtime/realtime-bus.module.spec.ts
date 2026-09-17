import { Injectable, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { RealtimeBusModule } from './realtime-bus.module';
import { RealtimeBusService } from './realtime-bus.service';

@Injectable()
class Consumer {
  constructor(readonly bus: RealtimeBusService) {}
}
@Module({ providers: [Consumer] })
class ConsumerModule {}

it('shares the bus across independent modules without importing auth', async () => {
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ ignoreEnvFile: true, skipProcessEnv: true }),
      RealtimeBusModule,
      ConsumerModule,
    ],
  }).compile();
  try {
    const consumer = module.get(Consumer);
    const received = jest.fn();
    expect(consumer.bus).toBe(module.get(RealtimeBusService));
    consumer.bus.subscribe(received);
    await module
      .get(RealtimeBusService)
      .publishInvalidation({ kind: 'user', userId: 'synthetic' }, ['scores']);
    expect(received).toHaveBeenCalledTimes(1);
  } finally {
    await module.close();
  }
});
