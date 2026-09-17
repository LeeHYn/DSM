import { Type } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @Type(() => Object)
  @IsString()
  @MaxLength(40)
  nickname?: string;

  @IsOptional()
  @Type(() => Object)
  @IsString()
  @MaxLength(65536)
  imageBase64?: string | null;
}
