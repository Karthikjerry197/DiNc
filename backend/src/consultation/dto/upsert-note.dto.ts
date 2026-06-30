import { IsNotEmpty, IsString } from 'class-validator';

/** Request body for POST /api/activities/:activityId/consultation-note (upsert DRAFT). */
export class UpsertNoteDto {
  @IsString()
  @IsNotEmpty({ message: 'Note content is required.' })
  generatedNote!: string;
}
