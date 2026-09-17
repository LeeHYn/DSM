import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';

const PROFILE_SELECT = {
  id: true,
  nickname: true,
  profileImageUrl: true,
} as const;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export interface Profile {
  userId: string;
  nickname: string;
  profileImageUrl: string | null;
}

export interface ProfileUpdate {
  nickname?: string;
  imageBase64?: string | null;
}

@Injectable()
export class ProfilesService {
  private activeImageProcesses = 0;

  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string): Promise<Profile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: PROFILE_SELECT,
    });
    if (!user) throw new NotFoundException('Profile not found');
    return {
      userId: user.id,
      nickname: user.nickname,
      profileImageUrl: user.profileImageUrl,
    };
  }

  async updateProfile(userId: string, input: ProfileUpdate): Promise<Profile> {
    const current = await this.getProfile(userId);
    const data: { nickname?: string; profileImageUrl?: string | null } = {};
    if (input.nickname !== undefined) {
      if (typeof input.nickname !== 'string') {
        throw new BadRequestException('Invalid nickname');
      }
      const nickname = input.nickname.trim();
      if (nickname.length === 0 || Array.from(nickname).length > 20) {
        throw new BadRequestException(
          'Nickname must contain 1 to 20 characters',
        );
      }
      data.nickname = nickname;
    }
    if (input.imageBase64 !== undefined) {
      data.profileImageUrl =
        input.imageBase64 === null
          ? null
          : await this.normalizeImage(input.imageBase64);
    }
    if (Object.keys(data).length === 0) return current;
    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data,
        select: PROFILE_SELECT,
      });
      return {
        userId: user.id,
        nickname: user.nickname,
        profileImageUrl: user.profileImageUrl,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException('Nickname already exists');
        }
        if (error.code === 'P2025') {
          throw new NotFoundException('Profile not found');
        }
      }
      throw error;
    }
  }

  private async normalizeImage(base64: string): Promise<string> {
    if (
      typeof base64 !== 'string' ||
      base64.length === 0 ||
      base64.length > 65536 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        base64,
      )
    ) {
      throw new BadRequestException('Invalid profile image');
    }
    const input = Buffer.from(base64, 'base64');
    if (input.toString('base64') !== base64) {
      throw new BadRequestException('Invalid profile image');
    }
    if (this.activeImageProcesses >= 2) {
      throw new ServiceUnavailableException('Profile image processing is busy');
    }
    this.activeImageProcesses += 1;
    try {
      const isPng = input.subarray(0, 8).equals(PNG_SIGNATURE);
      const isJpeg =
        input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff;
      if (!isPng && !isJpeg) throw new Error('Unsupported image');
      if (isPng) this.rejectAnimatedPng(input);
      const pipeline = sharp(input, {
        limitInputPixels: 2_000_000,
        failOn: 'warning',
      });
      const metadata = await pipeline.metadata();
      if (
        !['jpeg', 'png'].includes(metadata.format) ||
        (metadata.pages ?? 1) !== 1 ||
        (metadata.delay?.length ?? 0) > 1
      ) {
        throw new Error('Unsupported image');
      }
      const output = await pipeline
        .autoOrient()
        .resize(128, 128, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 70 })
        .toBuffer();
      if (output.length > 16384) throw new Error('Profile image is too large');
      return `data:image/jpeg;base64,${output.toString('base64')}`;
    } catch {
      throw new BadRequestException('Invalid profile image');
    } finally {
      this.activeImageProcesses -= 1;
    }
  }

  private rejectAnimatedPng(input: Buffer): void {
    for (let offset = 8; offset + 12 <= input.length; ) {
      const length = input.readUInt32BE(offset);
      const type = input.toString('ascii', offset + 4, offset + 8);
      if (offset + length + 12 > input.length || type === 'acTL') {
        throw new Error('Invalid or animated PNG');
      }
      if (type === 'IEND') return;
      offset += length + 12;
    }
    throw new Error('Incomplete PNG');
  }
}
