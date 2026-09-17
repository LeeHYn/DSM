import { NestFactory } from '@nestjs/core';
import { configureApp } from './app.bootstrap';
import { AppModule } from './app.module';
import { RealtimeWsAdapter } from './realtime/realtime-ws.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new RealtimeWsAdapter(app));
  configureApp(app);
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
