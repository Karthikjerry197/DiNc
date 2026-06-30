import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCarePlanDto {
  @IsString({ message: 'Title is required.' })
  @MaxLength(200, { message: 'Title must be 200 characters or fewer.' })
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Summary must be 1000 characters or fewer.' })
  summary?: string;
}
