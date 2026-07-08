import { IsBoolean, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ASSIGNABLE_ROLES } from '../user.types';

/** Partial update: Edit User, Assign Role and Enable/Disable all use this shape. */
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  fullName?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email must be a valid address.' })
  @MaxLength(160)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  designation?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  facility?: string | null;

  @IsOptional()
  @IsIn(ASSIGNABLE_ROLES as readonly string[], {
    message: `Role must be one of: ${ASSIGNABLE_ROLES.join(', ')}.`,
  })
  role?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
