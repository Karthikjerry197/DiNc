import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const VALID_WIDGET_IDS = [
  // Existing composite widgets
  'quick-actions',
  'kpi-cards',
  'worklist',
  'programs',
  'services',
  'activity',
  // Individual stat card widgets
  'stat-citizens',
  'stat-enrollments',
  'stat-programs',
  'stat-tasks',
  'stat-overdue',
] as const;

export class LayoutItemDto {
  @IsString()
  @IsIn(VALID_WIDGET_IDS, {
    message: `widgetId must be one of: ${VALID_WIDGET_IDS.join(', ')}`,
  })
  widgetId!: string;

  @IsBoolean()
  visible!: boolean;

  @IsBoolean()
  collapsed!: boolean;

  /** Grid column span (1–3). Defaults to 1 when omitted. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  colSpan?: number;
}

export class SaveLayoutDto {
  @IsString()
  role!: string;

  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => LayoutItemDto)
  layout!: LayoutItemDto[];
}
