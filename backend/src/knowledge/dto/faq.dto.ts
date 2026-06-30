import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Request body for creating/updating an FAQ (POST /api/knowledge/faqs[/:id]).
 * Maps directly to the existing faqs columns. The global ValidationPipe rejects
 * unknown fields.
 */
export class FaqDto {
  @IsString()
  @MinLength(1, { message: 'Question is required.' })
  @MaxLength(2000, { message: 'Question must be 2000 characters or fewer.' })
  question!: string;

  @IsString()
  @MinLength(1, { message: 'Answer is required.' })
  @MaxLength(8000, { message: 'Answer must be 8000 characters or fewer.' })
  answer!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Category must be 100 characters or fewer.' })
  category?: string;
}
