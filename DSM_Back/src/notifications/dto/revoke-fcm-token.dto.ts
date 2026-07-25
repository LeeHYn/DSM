import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class RevokeFcmTokenDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\S+$/)
  @MaxLength(4096)
  token!: string;
}
