import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { SessionVerifierService } from '../auth/session-verifier.service';
import { RealtimeModule } from './realtime.module';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeBusService } from './realtime-bus.service';
import { ReminderSignalService } from './reminder-signal.service';

it('resolves the gateway, shared verifier and bus through real Nest module dependencies', async () => {
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        skipProcessEnv: true,
        load: [() => ({ GOOGLE_CLIENT_ID: 'synthetic-realtime-client' })],
      }),
      PrismaModule,
      RealtimeModule,
    ],
  })
    .overrideProvider(PrismaService)
    .useValue({})
    .compile();
  try {
    expect(module.get(RealtimeGateway)).toBeInstanceOf(RealtimeGateway);
    expect(module.get(SessionVerifierService)).toBeInstanceOf(
      SessionVerifierService,
    );
    expect(module.get(RealtimeBusService)).toBeInstanceOf(RealtimeBusService);
    expect(module.get(ReminderSignalService)).toBeInstanceOf(
      ReminderSignalService,
    );
  } finally {
    await module.close();
  }
});
