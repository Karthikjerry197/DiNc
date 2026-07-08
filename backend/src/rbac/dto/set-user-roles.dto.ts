import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

/**
 * Assign roles to a user (Milestone 2). The first key is treated as the primary
 * role and mirrored to `users.role` so existing (still-hardcoded) enforcement
 * stays correct until Milestone 4. Accepts an array for forward-compatibility
 * with multiple roles (Milestone 5); today the workspace sends exactly one.
 */
export class SetUserRolesDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'At least one role must be assigned.' })
  @IsString({ each: true })
  roleKeys!: string[];
}
