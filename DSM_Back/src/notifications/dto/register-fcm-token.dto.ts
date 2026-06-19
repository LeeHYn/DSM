import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RegisterFcmTokenDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @IsNotEmpty()
  platform!: string;

  @IsString()
  @IsOptional()
  deviceId?: string;
}
