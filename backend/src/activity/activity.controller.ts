import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateActivityDto } from './dto/create-activity.dto';
import { ActivityService } from './activity.service';
import { ActivityDto, ActivityOptionsDto } from './activity.types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * HTTP layer for activities. Holds no SQL and no business logic — it validates
 * path params, delegates to the service, and maps "not found" to 404. Protected
 * by the existing JWT guard.
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

  @Get('enrollments/:enrollmentId/activity-options')
  getActivityOptions(
    @Param('enrollmentId') enrollmentId: string,
  ): Promise<ActivityOptionsDto> {
    if (!UUID_RE.test(enrollmentId)) {
      throw new NotFoundException('Enrollment not found');
    }
    return this.activities.getActivityOptions(enrollmentId);
  }

  @Post('enrollments/:enrollmentId/activities')
  @HttpCode(HttpStatus.CREATED)
  createActivity(
    @Param('enrollmentId') enrollmentId: string,
    @Body() body: CreateActivityDto,
  ): Promise<ActivityDto> {
    if (!UUID_RE.test(enrollmentId)) {
      throw new NotFoundException('Enrollment not found');
    }
    return this.activities.createActivity(enrollmentId, body);
  }

  /**
   * Step 6A: marks one activity_instance complete and advances the lifecycle
   * (next activity, event completion, dependent-event activation) atomically.
   */
  @Post('activity-instances/:activityInstanceId/complete')
  @HttpCode(HttpStatus.OK)
  completeActivityInstance(
    @Param('activityInstanceId') activityInstanceId: string,
  ): Promise<{
    eventInstanceId: string;
    eventCompleted: boolean;
    nextActivityInstanceId: string | null;
    activatedEvents: { eventInstanceId: string; eventCode: string; dueDate: string }[];
  }> {
    if (!UUID_RE.test(activityInstanceId)) {
      throw new NotFoundException('Activity instance not found');
    }
    return this.activities.completeActivityInstance(activityInstanceId);
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
