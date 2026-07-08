import { IsArray, IsHexColor, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Create a custom role (Milestone 3). The key is derived from the name. */
export class CreateRoleDto {
  @IsString()
  @MinLength(2, { message: 'Role name must be at least 2 characters.' })
  @MaxLength(60, { message: 'Role name must be at most 60 characters.' })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsHexColor({ message: 'Colour must be a hex value like #2563eb.' })
  color?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissionKeys?: string[];
}
