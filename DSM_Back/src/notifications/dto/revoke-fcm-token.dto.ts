import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class RevokeFcmTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  @Matches(/\S/)
  token!: string;
}
