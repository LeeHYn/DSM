import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { configureApp } from '../src/app.bootstrap';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { ProfilesController } from '../src/profiles/profiles.controller';
import { ProfilesService } from '../src/profiles/profiles.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Profile input (HTTP)', () => {
  let app: INestApplication<App>;
  const findUnique = jest.fn();
  const update = jest.fn();
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ProfilesController],
      providers: [
        ProfilesService,
        { provide: PrismaService, useValue: { user: { findUnique, update } } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          context.switchToHttp().getRequest<{ user: { sub: string } }>().user =
            { sub: 'profile-user' };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    findUnique.mockResolvedValue({
      id: 'profile-user',
      nickname: 'Before',
      profileImageUrl: null,
    });
    update.mockResolvedValue({
      id: 'profile-user',
      nickname: 'After',
      profileImageUrl: null,
    });
  });
  afterAll(async () => app.close());
  it('loads only the authenticated profile', async () => {
    await request(app.getHttpServer()).get('/profile').expect(200, {
      userId: 'profile-user',
      nickname: 'Before',
      profileImageUrl: null,
    });
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'profile-user' } }),
    );
  });
  it.each([
    { nickname: '' },
    { nickname: '   ' },
    { nickname: 'a'.repeat(21) },
    { nickname: 123 },
    { nickname: null },
    { imageBase64: 123 },
    { imageBase64: 'not-base64' },
    { imageBase64: 'a'.repeat(65540) },
  ])('rejects malformed profile input %j without writing', async (body) => {
    await request(app.getHttpServer()).patch('/profile').send(body).expect(400);
    expect(update).not.toHaveBeenCalled();
  });
  it('preserves explicit photo removal and trimmed nickname', async () => {
    await request(app.getHttpServer())
      .patch('/profile')
      .send({ nickname: '  After  ', imageBase64: null })
      .expect(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'profile-user' },
        data: { nickname: 'After', profileImageUrl: null },
      }),
    );
  });
});
