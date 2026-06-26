import {
  Controller,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EnrollmentService } from './enrollment.service';
import {
  EnrollmentDetailDto,
  EnrollmentSummaryDto,
  ProgramDto,
} from './enrollment.types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Read-only HTTP layer for Program & Enrollment management. Holds no SQL and no
 * business logic — it only validates input, delegates to the service, and maps
 * "not found" to a 404. Protected by the existing JWT guard.
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class EnrollmentController {
  constructor(private readonly enrollment: EnrollmentService) {}

  @Get('programs')
  getPrograms(): Promise<ProgramDto[]> {
    return this.enrollment.getActivePrograms();
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
