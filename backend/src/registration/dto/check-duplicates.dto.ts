import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Request body for POST /api/registration/check-duplicates (pre-registration). */
export class CheckDuplicatesDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  uhid?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  aadhaar?: string;
}
