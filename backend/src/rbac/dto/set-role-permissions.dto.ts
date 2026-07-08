import { IsArray, IsString } from 'class-validator';

/** Replace a role's permission grants (Milestone 3). May be empty. */
export class SetRolePermissionsDto {
  @IsArray()
  @IsString({ each: true })
  permissionKeys!: string[];
}
