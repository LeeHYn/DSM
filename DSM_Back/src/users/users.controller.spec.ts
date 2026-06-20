import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { NotificationMode, SocialProvider, Tier } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

const MOCK_USER = {
  id: 'user-uuid-1',
  email: 'user@example.com',
  nickname: 'starter',
  profileImageUrl: null,
  totalScore: 120,
  tier: Tier.BRONZE,
  notificationEnabled: true,
  notificationMode: NotificationMode.SOUND,
  createdAt: new Date('2026-06-20T00:00:00.000Z'),
  updatedAt: new Date('2026-06-20T00:00:00.000Z'),
};

const makeUsersServiceMock = () => ({
  getMe: jest.fn().mockResolvedValue(MOCK_USER),
  deleteMe: jest.fn().mockResolvedValue(undefined),
  updateProfile: jest.fn().mockResolvedValue(MOCK_USER),
  updateNotificationSettings: jest.fn().mockResolvedValue(MOCK_USER),
  getSocialAccounts: jest
    .fn()
    .mockResolvedValue([{ provider: SocialProvider.GOOGLE }]),
});

const makeAuthRequest = (userId = 'user-uuid-1') =>
  ({ user: { sub: userId, type: 'access' } }) as never;

describe('UsersController', () => {
  let controller: UsersController;
  let usersServiceMock: ReturnType<typeof makeUsersServiceMock>;

  beforeEach(async () => {
    usersServiceMock = makeUsersServiceMock();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: usersServiceMock },
        {
          provide: JwtService,
          useValue: { verify: jest.fn(), sign: jest.fn() },
        },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        JwtAuthGuard,
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('getMe delegates to usersService.getMe', async () => {
    const result = await controller.getMe(makeAuthRequest());

    expect(usersServiceMock.getMe).toHaveBeenCalledWith('user-uuid-1');
    expect(result).toEqual(MOCK_USER);
  });

  it('updateProfile delegates to usersService.updateProfile', async () => {
    const dto = { nickname: 'renamed', profileImageUrl: null };

    await controller.updateProfile(makeAuthRequest(), dto);

    expect(usersServiceMock.updateProfile).toHaveBeenCalledWith(
      'user-uuid-1',
      dto,
    );
  });

  it('updateNotificationSettings delegates to usersService.updateNotificationSettings', async () => {
    const dto = {
      notificationEnabled: false,
      notificationMode: NotificationMode.SILENT,
    };

    await controller.updateNotificationSettings(makeAuthRequest(), dto);

    expect(usersServiceMock.updateNotificationSettings).toHaveBeenCalledWith(
      'user-uuid-1',
      dto,
    );
  });

  it('deleteMe delegates to usersService.deleteMe', async () => {
    const dto = { refreshToken: 'rt-1.secret' };

    await controller.deleteMe(makeAuthRequest(), dto);

    expect(usersServiceMock.deleteMe).toHaveBeenCalledWith('user-uuid-1', dto);
  });

  it('getSocialAccounts delegates to usersService.getSocialAccounts', async () => {
    const result = await controller.getSocialAccounts(makeAuthRequest());

    expect(usersServiceMock.getSocialAccounts).toHaveBeenCalledWith(
      'user-uuid-1',
    );
    expect(result).toEqual([{ provider: SocialProvider.GOOGLE }]);
  });
});
