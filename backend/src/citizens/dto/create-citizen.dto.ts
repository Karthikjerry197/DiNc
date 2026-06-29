import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Request body for POST /api/citizens (register a new patient).
 *
 * Only columns that exist on public.citizens are accepted. `uhid` is required and
 * UNIQUE in the schema; `full_name` is required for a usable patient record. The
 * global ValidationPipe (whitelist + forbidNonWhitelisted) rejects anything else.
 */
export class CreateCitizenDto {
  @IsString()
  @MinLength(1, { message: 'UHID is required.' })
  @MaxLength(50, { message: 'UHID must be 50 characters or fewer.' })
  uhid!: string;

  @IsString()
  @MinLength(1, { message: 'Full name is required.' })
  @MaxLength(255, { message: 'Full name must be 255 characters or fewer.' })
  fullName!: string;

  @IsOptional()
  @IsInt({ message: 'Age must be a whole number.' })
  @Min(0)
  @Max(130)
  age?: number;

  @IsOptional()
  @IsString()
  @MaxLength(10, { message: 'Gender must be 10 characters or fewer.' })
  gender?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'Phone must be 20 characters or fewer.' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'District must be 100 characters or fewer.' })
  district?: string;
}
