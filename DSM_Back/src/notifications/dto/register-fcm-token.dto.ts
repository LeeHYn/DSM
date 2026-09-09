import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class RegisterFcmTokenDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\S+$/)
  @MaxLength(4096)
  token!: string;

  @IsIn(['ios', 'android'])
  platform!: 'ios' | 'android';

  @IsString()
  @IsOptional()
  @MaxLength(255)
  deviceId?: string;
}
