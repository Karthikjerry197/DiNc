import {
  IsBoolean,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Import payload for a new guidebook ("New Protocol"). Maps directly onto the
 * existing guidebooks table + guidebook_sections JSONB — no new storage format.
 * `sections` is an arbitrary map of section name → text or ordered list; the
 * service normalizes it and rejects unusable values. Section names are NOT
 * constrained, so any future section appears automatically.
 */
export class ImportGuidebookDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  category!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  source?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Arbitrary section map; values must be string or string[] (validated in the service). */
  @IsObject()
  sections!: Record<string, unknown>;
}
