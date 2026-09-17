import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { crc32 } from 'node:zlib';
import sharp, { type Metadata } from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { ProfilesService } from './profiles.service';

const USER = { id: 'user-1', nickname: 'Before', profileImageUrl: 'old-photo' };

function pngChunk(type: string, data: Buffer): Buffer {
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4);
  return chunk;
}

describe('ProfilesService', () => {
  let service: ProfilesService;
  let png: Buffer;
  let orientedJpeg: Buffer;
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeAll(async () => {
    png = await sharp({
      create: { width: 400, height: 200, channels: 3, background: '#228844' },
    })
      .png()
      .toBuffer();
    orientedJpeg = await sharp(png)
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue(USER);
    prisma.user.update.mockImplementation((args: { data: object }) =>
      Promise.resolve({ ...USER, ...args.data }),
    );
    service = new ProfilesService(prisma as unknown as PrismaService);
  });

  afterEach(() => jest.restoreAllMocks());

  it('returns only the authenticated profile projection', async () => {
    await expect(service.getProfile('user-1')).resolves.toEqual({
      userId: 'user-1',
      nickname: 'Before',
      profileImageUrl: 'old-photo',
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { id: true, nickname: true, profileImageUrl: true },
    });
  });

  it.each([' A ', '가'.repeat(20), '😀'.repeat(20)])(
    'saves trimmed nickname %s',
    async (nickname) => {
      await expect(
        service.updateProfile('user-1', { nickname }),
      ).resolves.toMatchObject({
        nickname: nickname.trim(),
        profileImageUrl: 'old-photo',
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { nickname: nickname.trim() },
        select: { id: true, nickname: true, profileImageUrl: true },
      });
    },
  );

  it.each(['', '   ', 'a'.repeat(21)])('rejects name %s', async (nickname) => {
    await expect(
      service.updateProfile('user-1', { nickname }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('clears an image only for explicit null', async () => {
    await expect(
      service.updateProfile('user-1', { imageBase64: null }),
    ).resolves.toMatchObject({ profileImageUrl: null });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { profileImageUrl: null },
      select: { id: true, nickname: true, profileImageUrl: true },
    });
  });

  it('returns the current profile for an empty update', async () => {
    await expect(service.updateProfile('user-1', {})).resolves.toMatchObject({
      nickname: 'Before',
      profileImageUrl: 'old-photo',
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects an absent user before decoding or writing', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.getProfile('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.updateProfile('missing', { imageBase64: png.toString('base64') }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it.each([
    ['P2002', 409],
    ['P2025', 404],
  ] as const)('maps %s to %i', async (code, status) => {
    prisma.user.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('database detail', {
        code,
        clientVersion: 'test',
      }),
    );
    await expect(
      service.updateProfile('user-1', { nickname: 'After' }),
    ).rejects.toMatchObject({ status });
  });

  it('preserves unknown database errors', async () => {
    const error = new Error('database unavailable');
    prisma.user.update.mockRejectedValue(error);
    await expect(
      service.updateProfile('user-1', { nickname: 'After' }),
    ).rejects.toBe(error);
  });

  it.each(['png', 'jpeg'])('normalizes %s pixels and EXIF', async (format) => {
    const input = format === 'png' ? png : orientedJpeg;
    const original = await sharp(input).metadata();
    if (format === 'jpeg') expect(original.exif).toBeDefined();
    const result = await service.updateProfile('user-1', {
      imageBase64: input.toString('base64'),
    });
    expect(result.profileImageUrl).toMatch(/^data:image\/jpeg;base64,/);
    const output = Buffer.from(result.profileImageUrl!.split(',')[1], 'base64');
    const metadata = await sharp(output).metadata();
    expect(output.length).toBeLessThanOrEqual(16384);
    expect(metadata.format).toBe('jpeg');
    expect([metadata.width, metadata.height]).toEqual(
      format === 'png' ? [128, 64] : [64, 128],
    );
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(metadata.orientation).toBeUndefined();
    expect(result.nickname).toBe('Before');
  });

  it('does not enlarge small images', async () => {
    const small = await sharp(png).resize(16, 8).png().toBuffer();
    const result = await service.updateProfile('user-1', {
      imageBase64: small.toString('base64'),
    });
    const metadata = await sharp(
      Buffer.from(result.profileImageUrl!.split(',')[1], 'base64'),
    ).metadata();
    expect([metadata.width, metadata.height]).toEqual([16, 8]);
  });

  it.each([
    '',
    'AAAA\n',
    'Zh==',
    'data:image/png;base64,AAAA',
    'A'.repeat(65540),
  ])('rejects noncanonical or oversized base64', async (imageBase64) => {
    await expect(
      service.updateProfile('user-1', { imageBase64 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects malformed pixels and unsupported formats', async () => {
    const webp = await sharp(png).webp().toBuffer();
    for (const image of [webp, Buffer.from('<svg/>'), png.subarray(0, 40)]) {
      await expect(
        service.updateProfile('user-1', {
          imageBase64: image.toString('base64'),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects images over two megapixels even when compressed input is small', async () => {
    const large = await sharp({
      create: { width: 2001, height: 1000, channels: 3, background: 'white' },
    })
      .png()
      .toBuffer();
    expect(large.toString('base64').length).toBeLessThan(65536);
    await expect(
      service.updateProfile('user-1', {
        imageBase64: large.toString('base64'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts the exact two megapixel boundary', async () => {
    const input = await sharp({
      create: { width: 2000, height: 1000, channels: 3, background: 'white' },
    })
      .png()
      .toBuffer();
    await expect(
      service.updateProfile('user-1', {
        imageBase64: input.toString('base64'),
      }),
    ).resolves.toMatchObject({ userId: 'user-1' });
  });

  it('accepts canonical base64 at exactly 65536 characters', async () => {
    const input = Buffer.concat([png, Buffer.alloc(49152 - png.length)]);
    const imageBase64 = input.toString('base64');
    expect(imageBase64).toHaveLength(65536);
    await expect(
      service.updateProfile('user-1', { imageBase64 }),
    ).resolves.toMatchObject({ userId: 'user-1' });
  });

  it('rejects encoded output over 16KiB and releases processing capacity', async () => {
    jest
      .spyOn(sharp.prototype, 'toBuffer')
      .mockResolvedValueOnce(Buffer.alloc(16385));
    const imageBase64 = png.toString('base64');
    await expect(
      service.updateProfile('user-1', { imageBase64 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
    await expect(
      service.updateProfile('user-1', { imageBase64 }),
    ).resolves.toMatchObject({ userId: 'user-1' });
  });

  it('rejects APNG animation control even when metadata reports only PNG', async () => {
    const control = Buffer.alloc(8);
    control.writeUInt32BE(1, 0);
    const frame = Buffer.alloc(26);
    frame.writeUInt32BE(400, 4);
    frame.writeUInt32BE(200, 8);
    frame.writeUInt16BE(1, 20);
    frame.writeUInt16BE(1, 22);
    const animated = Buffer.concat([
      png.subarray(0, 33),
      pngChunk('acTL', control),
      pngChunk('fcTL', frame),
      png.subarray(33),
    ]);
    expect((await sharp(animated).metadata()).format).toBe('png');
    await expect(
      service.updateProfile('user-1', {
        imageBase64: animated.toString('base64'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('limits concurrent image processing but permits nickname-only updates and releases slots', async () => {
    const metadata = await sharp(png).metadata();
    let release: (value: Metadata) => void = () => undefined;
    const held = new Promise<Metadata>((resolve) => {
      release = resolve;
    });
    jest
      .spyOn(sharp.prototype, 'metadata')
      .mockImplementationOnce(() => held)
      .mockImplementationOnce(() => held);
    const imageBase64 = png.toString('base64');
    const first = service.updateProfile('user-1', { imageBase64 });
    const second = service.updateProfile('user-1', { imageBase64 });
    const pending = Promise.all([first, second]);
    pending.catch(() => undefined);
    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      await expect(
        service.updateProfile('user-1', { imageBase64 }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(
        service.updateProfile('user-1', { nickname: 'Independent' }),
      ).resolves.toMatchObject({ nickname: 'Independent' });
    } finally {
      release(metadata);
      await pending;
    }
    await expect(
      service.updateProfile('user-1', { imageBase64 }),
    ).resolves.toMatchObject({ userId: 'user-1' });
  });
});
