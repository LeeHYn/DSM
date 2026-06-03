import { IsEnum, IsString, IsNotEmpty } from 'class-validator';
import { SocialProvider } from '@prisma/client';

export { SocialProvider };

export class SocialLoginDto {
  @IsEnum(SocialProvider)
  provider!: SocialProvider;

  @IsString()
  @IsNotEmpty()
  token!: string;
}
