import { IsString, IsNotEmpty, ValidateIf, IsHexColor } from 'class-validator';

export class UpdateCategoryDto {
  @IsString()
  @IsNotEmpty()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  name?: string;

  @IsHexColor()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  color?: string;
}
