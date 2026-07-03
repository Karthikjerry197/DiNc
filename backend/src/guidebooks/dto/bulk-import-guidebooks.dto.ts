import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { ImportGuidebookDto } from './import-guidebook.dto';

/**
 * Bulk import payload: many guidebooks in one request. Each entry is the exact
 * same shape as the single-import DTO — there is only one import pipeline.
 */
export class BulkImportGuidebooksDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ImportGuidebookDto)
  guidebooks!: ImportGuidebookDto[];
}
