import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Request body for POST /api/registration.
 *
 * Demographics mirror the citizens columns (UHID optional — auto-generated when
 * blank). `programIds` are the selected active programs to enroll into;
 * `assignedTo` is the responsible worker username. `force` bypasses the duplicate
 * warning ("Continue Anyway"). The global ValidationPipe rejects unknown fields.
 */
export class RegisterPatientDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  uhid?: string;

  @IsString()
  @MinLength(1, { message: 'Full name is required.' })
  @MaxLength(255)
  fullName!: string;

  @IsOptional()
  @IsInt({ message: 'Age must be a whole number.' })
  @Min(0)
  @Max(130)
  age?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  gender?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  village?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  district?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  aadhaar?: string;

  @IsArray()
  @ArrayMaxSize(20)
  // 'all': DiNc metadata programme ids are deterministic UUIDv5 (Step 5).
  @IsUUID('all', { each: true, message: 'A valid program must be selected.' })
  programIds!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  assignedTo?: string;

  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
