import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { CreateCitizenDto } from './create-citizen.dto';

/**
 * Request body for POST /api/citizens/bulk. The frontend parses the uploaded CSV
 * client-side and submits the rows here; each row is validated as a CreateCitizenDto.
 * Reuses the exact same per-patient shape as single registration — one workflow.
 */
export class BulkUploadDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one patient row is required.' })
  @ArrayMaxSize(2000, { message: 'A maximum of 2000 patients can be uploaded at once.' })
  @ValidateNested({ each: true })
  @Type(() => CreateCitizenDto)
  patients!: CreateCitizenDto[];
}
