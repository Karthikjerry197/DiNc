import {
  Controller,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActivityService } from './activity.service';
import { ActivityDto } from './activity.types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Read-only HTTP layer for activities. Holds no SQL and no business logic — it
 * validates path params, delegates to the service, and maps "not found" to 404.
 * Protected by the existing JWT guard.
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class ActivityController {
  constructor(private readonly activities: ActivityService) {}

  @Get('enrollments/:enrollmentId/activities')
  getForEnrollment(
    @Param('enrollmentId') enrollmentId: string,
  ): Promise<ActivityDto[]> {
    if (!UUID_RE.test(enrollmentId)) {
      throw new NotFoundException('Enrollment not found');
    }
    return this.activities.getForEnrollment(enrollmentId);
  }

  @Get('activities/:activityId')
  async getActivity(@Param('activityId') activityId: string): Promise<ActivityDto> {
    if (!UUID_RE.test(activityId)) {
      throw new NotFoundException('Activity not found');
    }
    const activity = await this.activities.getById(activityId);
    if (!activity) {
      throw new NotFoundException('Activity not found');
    }
    return activity;
  }
}
