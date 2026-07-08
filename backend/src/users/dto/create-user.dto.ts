import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ASSIGNABLE_ROLES } from '../user.types';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  @Matches(/^[a-z0-9._-]+$/i, {
    message: 'Username may contain only letters, numbers, dots, hyphens and underscores.',
  })
  username!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  fullName!: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email must be a valid address.' })
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  designation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  facility?: string;

  @IsIn(ASSIGNABLE_ROLES as readonly string[], {
    message: `Role must be one of: ${ASSIGNABLE_ROLES.join(', ')}.`,
  })
  role!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters.' })
  password!: string;
}
