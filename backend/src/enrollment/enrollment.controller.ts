import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/types/jwt-payload.type';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { EnrollmentService } from './enrollment.service';
import {
  CreateEnrollmentResultDto,
  EventActivityDto,
  DiseaseDto,
  EnrollmentDetailDto,
  EnrollmentGuidebookDto,
  EnrollmentSummaryDto,
  EventDto,
  ProgramDto,
  SubProgramDto,
} from './enrollment.types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * HTTP layer for Program & Enrollment management. Holds no SQL and no business
 * logic — it validates path params, delegates to the service, and lets the
 * global pipes/filters translate validation and domain errors into clean HTTP
 * responses. Protected by the existing JWT guard.
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class EnrollmentController {
  constructor(private readonly enrollment: EnrollmentService) {}

  @Get('programs')
  getPrograms(): Promise<ProgramDto[]> {
    return this.enrollment.getActivePrograms();
  }

  @Get('programs/:programId/sub-programs')
  getSubPrograms(@Param('programId') programId: string): Promise<SubProgramDto[]> {
    if (!UUID_RE.test(programId)) {
      throw new NotFoundException('Program not found');
    }
    return this.enrollment.getSubPrograms(programId);
  }

  @Get('sub-programs/:subProgramId/diseases')
  getDiseases(@Param('subProgramId') subProgramId: string): Promise<DiseaseDto[]> {
    if (!UUID_RE.test(subProgramId)) {
      throw new NotFoundException('Sub-program not found');
    }
    return this.enrollment.getDiseases(subProgramId);
  }

  @Get('diseases/:diseaseId/events')
  getEvents(@Param('diseaseId') diseaseId: string): Promise<EventDto[]> {
    if (!UUID_RE.test(diseaseId)) {
      throw new NotFoundException('Condition not found');
    }
    return this.enrollment.getEvents(diseaseId);
  }

  @Get('events/:eventId/activities')
  getActivities(@Param('eventId') eventId: string): Promise<EventActivityDto[]> {
    if (!UUID_RE.test(eventId)) {
      throw new NotFoundException('Event not found');
    }
    return this.enrollment.getActivities(eventId);
  }

  @Get('citizens/:citizenId/enrollments')
  getCitizenEnrollments(
    @Param('citizenId') citizenId: string,
  ): Promise<EnrollmentSummaryDto[]> {
    if (!UUID_RE.test(citizenId)) {
      throw new NotFoundException('Citizen not found');
    }
    return this.enrollment.getEnrollmentsForCitizen(citizenId);
  }

  @Post('citizens/:citizenId/enrollments')
  @HttpCode(HttpStatus.CREATED)
  createEnrollment(
    @Param('citizenId') citizenId: string,
    @Body() body: CreateEnrollmentDto,
    @Req() req: Request,
  ): Promise<CreateEnrollmentResultDto> {
    if (!UUID_RE.test(citizenId)) {
      throw new NotFoundException('Citizen not found');
    }
    const user = (req as Request & { user?: JwtPayload }).user;
    return this.enrollment.createEnrollment(citizenId, body, user?.sub ?? null);
  }

  @Get('enrollments/:enrollmentId/guidebook')
  getEnrollmentGuidebook(
    @Param('enrollmentId') enrollmentId: string,
  ): Promise<EnrollmentGuidebookDto> {
    if (!UUID_RE.test(enrollmentId)) {
      throw new NotFoundException('Enrollment not found');
    }
    return this.enrollment.getGuidebookForEnrollment(enrollmentId);
  }

  @Get('enrollments/:id')
  async getEnrollment(@Param('id') id: string): Promise<EnrollmentDetailDto> {
    if (!UUID_RE.test(id)) {
      throw new NotFoundException('Enrollment not found');
    }
    const detail = await this.enrollment.getEnrollmentById(id);
    if (!detail) {
      throw new NotFoundException('Enrollment not found');
    }
    return detail;
  }
}
