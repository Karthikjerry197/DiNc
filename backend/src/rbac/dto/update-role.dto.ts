import { IsBoolean, IsHexColor, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Update editable role details (Milestone 3). Key is immutable. */
export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsHexColor({ message: 'Colour must be a hex value like #2563eb.' })
  color?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
