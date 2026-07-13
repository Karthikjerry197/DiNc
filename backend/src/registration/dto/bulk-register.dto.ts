import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** A single patient row in a bulk upload (parsed client-side from CSV/XLSX). */
export class BulkPatientRow {
  @IsOptional() @IsString() @MaxLength(50) uhid?: string;
  @IsString() @MaxLength(255) fullName!: string;
  @IsOptional() @IsString() @MaxLength(8) age?: string;
  @IsOptional() @IsString() @MaxLength(10) gender?: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(120) village?: string;
  @IsOptional() @IsString() @MaxLength(100) district?: string;
  @IsOptional() @IsString() @MaxLength(20) aadhaar?: string;
  /** Program codes for this row (overrides the default selection when present). */
  @IsOptional() @IsString() @MaxLength(300) programs?: string;
}

/**
 * Request body for POST /api/registration/bulk. `defaultProgramIds` apply to rows
 * that don't specify their own `programs` column; `assignedTo` is applied to all.
 */
export class BulkRegisterDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one patient row is required.' })
  @ArrayMaxSize(2000, { message: 'A maximum of 2000 patients can be uploaded at once.' })
  @ValidateNested({ each: true })
  @Type(() => BulkPatientRow)
  patients!: BulkPatientRow[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  // 'all': DiNc metadata programme ids are deterministic UUIDv5 (Step 5).
  @IsUUID('all', { each: true })
  defaultProgramIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  assignedTo?: string;
}
