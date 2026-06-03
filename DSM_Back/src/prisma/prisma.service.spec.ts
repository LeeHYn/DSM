import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  it('is available through the testing module', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    const service = moduleRef.get(PrismaService);

    expect(service).toBeDefined();
    expect(typeof service.$connect).toBe('function');
  });
});
