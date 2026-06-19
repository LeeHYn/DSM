import { IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';

export class RevokeFcmTokenDto {
  @ValidateIf((dto: RevokeFcmTokenDto) => dto.deviceId === undefined)
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  token?: string;

  @ValidateIf((dto: RevokeFcmTokenDto) => dto.token === undefined)
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  deviceId?: string;
}
