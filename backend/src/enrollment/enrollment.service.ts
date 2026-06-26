import { Injectable } from '@nestjs/common';
import { EnrollmentRepository } from './enrollment.repository';
import {
  EnrollmentDetailDto,
  EnrollmentDetailRow,
  EnrollmentSummaryDto,
  EnrollmentSummaryRow,
  ProgramDto,
} from './enrollment.types';

/**
 * Business layer for Program & Enrollment reads. Maps raw repository rows to the
 * DTOs consumed by the frontend. Contains no SQL and performs no writes.
 */
@Injectable()
export class EnrollmentService {
  constructor(private readonly repo: EnrollmentRepository) {}

  async getActivePrograms(): Promise<ProgramDto[]> {
    const rows = await this.repo.findActivePrograms();
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
    }));
  }

  async getEnrollmentsForCitizen(citizenId: string): Promise<EnrollmentSummaryDto[]> {
    const rows = await this.repo.findEnrollmentsByCitizen(citizenId);
    return rows.map((row) => this.toSummary(row));
  }

  async getEnrollmentById(id: string): Promise<EnrollmentDetailDto | null> {
    const row = await this.repo.findEnrollmentById(id);
    return row ? this.toDetail(row) : null;
  }

  private toSummary(row: EnrollmentSummaryRow): EnrollmentSummaryDto {
    return {
      id: row.id,
      program: { id: row.program_id, name: row.program_name },
      subProgram: row.sub_program_id
        ? { id: row.sub_program_id, name: row.sub_program_name }
        : null,
      enrollmentDate: EnrollmentService.toIso(row.start_date),
      status: row.status,
      priority: row.priority,
      // No FK links an enrollment to a CPHC service in the schema.
      cphcService: null,
    };
  }

  private toDetail(row: EnrollmentDetailRow): EnrollmentDetailDto {
    return {
      id: row.id,
      citizen: { id: row.citizen_id, uhid: row.uhid },
      program: { id: row.program_id, name: row.program_name },
      subProgram: row.sub_program_id
        ? { id: row.sub_program_id, name: row.sub_program_name }
        : null,
      condition: row.disease_name,
      event: row.event_name,
      // The following are not modelled on the enrollment record — reported as
      // unavailable rather than fabricated.
      cphcService: null,
      assignee: row.assigned_worker,
      priority: row.priority,
      status: row.status,
      reviewStatus: null,
      remarks: null,
      enrollmentDate: EnrollmentService.toIso(row.start_date),
      geographicUnit: row.geographic_unit,
      enrolledBy: row.enrolled_by,
    };
  }

  private static toIso(value: Date | null): string | null {
    return value ? value.toISOString() : null;
  }
}
