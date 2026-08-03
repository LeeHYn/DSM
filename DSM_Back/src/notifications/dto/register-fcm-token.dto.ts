import {
  IsIn,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class RegisterFcmTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  @Matches(/\S/)
  token!: string;

  @IsIn(['ios', 'android'])
  platform!: 'ios' | 'android';

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Matches(/\S/)
  @ValidateIf((_, value) => value !== undefined)
  deviceId?: string;
}
