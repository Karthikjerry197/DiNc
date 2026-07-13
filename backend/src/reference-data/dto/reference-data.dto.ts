import {
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateCategoryDto {
  @IsString() @MinLength(1) @MaxLength(60)
  key!: string;

  @IsString() @MinLength(1) @MaxLength(100)
  name!: string;

  @IsOptional() @IsString() @MaxLength(500)
  description?: string;
}

export class UpdateCategoryDto {
  @IsOptional() @IsString() @MaxLength(100)
  name?: string;

  @IsOptional() @IsString() @MaxLength(500)
  description?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class CreateValueDto {
  @IsString() @MinLength(1) @MaxLength(80)
  code!: string;

  @IsString() @MinLength(1) @MaxLength(120)
  displayName!: string;

  @IsOptional() @IsString() @MaxLength(500)
  description?: string;

  @IsOptional() @IsString() @MaxLength(20)
  colour?: string;

  @IsOptional() @IsString() @MaxLength(40)
  icon?: string;

  @IsOptional() @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateValueDto {
  @IsOptional() @IsString() @MaxLength(120)
  displayName?: string;

  @IsOptional() @IsString() @MaxLength(500)
  description?: string;

  @IsOptional() @IsString() @MaxLength(20)
  colour?: string;

  @IsOptional() @IsString() @MaxLength(40)
  icon?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @IsOptional() @IsObject()
  metadata?: Record<string, unknown>;
}

export class ReorderValuesDto {
  @IsArray()
  @IsString({ each: true })
  orderedIds!: string[];
}
