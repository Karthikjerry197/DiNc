import { IsString } from 'class-validator';

export class DevSwitchDto {
  @IsString()
  username!: string;
}
