import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CitizensService } from '../citizens/citizens.service';
import { EnrollmentService } from '../enrollment/enrollment.service';
import { ReferenceDataService } from '../reference-data/reference-data.service';
import { GuidebookRef } from '../guidebooks/guidebooks.types';
import { DataQualityRepository } from './data-quality.repository';
import { CreateDuplicateRequestDto } from './dto/create-duplicate-request.dto';
import {
  DECISION_STATUS,
  DuplicateComparisonDto,
  DuplicateDecision,
  DuplicateRequestDto,
  DuplicateRequestRow,
  EnrollmentEntryDto,
  PatientComparisonSide,
  StatusHistoryEntry,
  StatusHistoryRow,
} from './data-quality.types';

/**
 * Business layer for the Duplicate Request workflow.
 *
 * Enforces the worker → review → resolve state machine and assembles the
 * side-by-side comparison by REUSING the existing read services
 * (CitizensService, EnrollmentService) rather than duplicating their SQL. No
 * patient record is ever deleted here without an explicit, audited resolution.
 */
@Injectable()
export class DataQualityService {
  constructor(
    private readonly repo: DataQualityRepository,
    private readonly citizens: CitizensService,
    private readonly enrollments: EnrollmentService,
    private readonly refData: ReferenceDataService,
  ) {}

  /** Creates a duplicate request after validating both citizens exist and differ. */
  async createRequest(
    dto: CreateDuplicateRequestDto,
    submittedBy: string,
  ): Promise<DuplicateRequestDto> {
    if (dto.currentCitizenId === dto.duplicateCitizenId) {
      throw new BadRequestException(
        'The current patient and the possible duplicate must be different.',
      );
    }
    // Validate the reason against the `duplicate_reason` Reference Data source of
    // truth (M40) instead of a hardcoded DTO array.
    if (!(await this.refData.isActiveValue('duplicate_reason', dto.reason))) {
      throw new BadRequestException('Invalid duplicate reason.');
    }
    if (!(await this.repo.citizenExists(dto.currentCitizenId))) {
      throw new NotFoundException('Current patient not found.');
    }
    if (!(await this.repo.citizenExists(dto.duplicateCitizenId))) {
      throw new NotFoundException('Possible duplicate patient not found.');
    }

    const id = await this.repo.insert({
      currentCitizenId: dto.currentCitizenId,
      duplicateCitizenId: dto.duplicateCitizenId,
      reason: dto.reason,
      comments: dto.comments?.trim() ? dto.comments.trim() : null,
      submittedBy,
    });

    const row = await this.repo.findById(id);
    if (!row) {
      throw new NotFoundException('Duplicate request could not be loaded after creation.');
    }
    return DataQualityService.toDto(row);
  }

  async listRequests(): Promise<DuplicateRequestDto[]> {
    const rows = await this.repo.findAll();
    return rows.map((row) => DataQualityService.toDto(row));
  }

  /** Approves a pending request, recording the reviewer and remarks. */
  async approve(
    id: string,
    reviewedBy: string,
    remarks: string | null,
  ): Promise<DuplicateRequestDto> {
    return this.transition(id, 'APPROVED', reviewedBy, remarks);
  }

  /** Rejects a pending request, recording the reviewer and remarks. */
  async reject(
    id: string,
    reviewedBy: string,
    remarks: string | null,
  ): Promise<DuplicateRequestDto> {
    return this.transition(id, 'REJECTED', reviewedBy, remarks);
  }

  /**
   * Records an Administrator Review decision (the Duplicate Review Workspace).
   *
   *   • REJECTED            → status REJECTED            (not a duplicate)
   *   • MULTIPLE_ENROLMENT  → status CLOSED              (valid multi-programme)
   *   • CONFIRMED_DUPLICATE → status CONFIRMED_DUPLICATE (awaiting future archive)
   *
   * Comments are mandatory for every decision (healthcare-grade auditability).
   * A CONFIRMED_DUPLICATE deliberately does NOT merge, archive or delete anything
   * — it only records intent, so the next milestone can add an Archive/Merge
   * action on top of this state without reworking the workflow.
   */
  async decide(
    id: string,
    decision: DuplicateDecision,
    reviewedBy: string,
    comments: string | null,
  ): Promise<DuplicateRequestDto> {
    const trimmed = (comments ?? '').trim();
    if (!trimmed) {
      throw new BadRequestException('Comments are required to record a review decision.');
    }
    const toStatus = DECISION_STATUS[decision];
    if (!toStatus) {
      throw new BadRequestException('Unknown review decision.');
    }

    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException('Duplicate request not found.');
    }
    if (existing.status !== 'PENDING') {
      throw new ConflictException(
        `This request has already been reviewed (${existing.status}) and cannot be changed.`,
      );
    }

    const row = await this.repo.decide(id, toStatus, decision, reviewedBy, trimmed);
    if (!row) {
      throw new ConflictException('This request could not be updated (already reviewed).');
    }
    return DataQualityService.toDto(row);
  }

  private async transition(
    id: string,
    status: 'APPROVED' | 'REJECTED',
    reviewedBy: string,
    remarks: string | null,
  ): Promise<DuplicateRequestDto> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException('Duplicate request not found.');
    }
    if (existing.status !== 'PENDING') {
      throw new ConflictException(
        `This request has already been ${existing.status.toLowerCase()} and cannot be changed.`,
      );
    }
    const row = await this.repo.review(id, status, reviewedBy, remarks);
    if (!row) {
      throw new ConflictException('This request could not be updated.');
    }
    return DataQualityService.toDto(row);
  }

  /**
   * Resolves an approved request by merging the duplicate into the current
   * patient or deleting the duplicate record.
   *
   * NOTE: the actual record migration/deletion is a deliberate placeholder for
   * this milestone — the request transitions to RESOLVED with the chosen
   * resolution and a complete audit trail, so the UI/workflow is end-to-end while
   * the data-movement logic can be implemented safely later. No citizen row is
   * physically deleted here.
   */
  async resolve(
    id: string,
    action: 'MERGE' | 'DELETE',
    reviewedBy: string,
    remarks: string | null,
  ): Promise<DuplicateRequestDto> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException('Duplicate request not found.');
    }
    if (existing.status !== 'APPROVED') {
      throw new ConflictException(
        'Only an approved request can be merged or deleted.',
      );
    }

    // ── Placeholder for the heavy data operation ──────────────────────────────
    // A future milestone will, within a transaction, re-point the duplicate's
    // enrollments/worklist items to the current patient (MERGE) and then remove
    // the duplicate citizen, or archive + delete it (DELETE). Until then we only
    // record the decision so nothing is silently destroyed.
    // await this.mergeOrDeleteRecords(existing, action);

    const resolution = action === 'MERGE' ? 'MERGED' : 'DELETED';
    const row = await this.repo.resolve(id, resolution, reviewedBy, remarks);
    if (!row) {
      throw new ConflictException('This request could not be resolved.');
    }
    return DataQualityService.toDto(row);
  }

  /** Builds the side-by-side comparison for the Compare Records dialog. */
  async compare(id: string): Promise<DuplicateComparisonDto> {
    const row = await this.repo.findById(id);
    if (!row) {
      throw new NotFoundException('Duplicate request not found.');
    }
    const [current, duplicate, history] = await Promise.all([
      this.buildSide(row.current_citizen_id),
      this.buildSide(row.duplicate_citizen_id),
      this.repo.findStatusHistory(id),
    ]);
    return {
      request: DataQualityService.toDto(row),
      current,
      duplicate,
      statusHistory: history.map(DataQualityService.toHistoryEntry),
    };
  }

  /** Assembles one patient's record by reusing the existing read services. */
  private async buildSide(citizenId: string): Promise<PatientComparisonSide> {
    const [detail, enrollmentSummaries, demographics, alerts] = await Promise.all([
      this.citizens.detail(citizenId),
      this.enrollments.getEnrollmentsForCitizen(citizenId),
      this.repo.findDemographics(citizenId),
      this.repo.findActiveAlerts(citizenId),
    ]);

    if (!detail) {
      throw new NotFoundException('A patient referenced by this request was not found.');
    }

    // Resolve each enrollment's context-aware guidebook (reusing the existing
    // resolver) so the comparison shows the same guidebook the worker would open.
    const enrollments: EnrollmentEntryDto[] = await Promise.all(
      enrollmentSummaries.map(async (summary) => {
        let guidebook: GuidebookRef | null = null;
        try {
          guidebook = (await this.enrollments.getGuidebookForEnrollment(summary.id))
            .guidebook;
        } catch {
          guidebook = null;
        }
        return { ...summary, guidebook };
      }),
    );

    const guidebooks = DataQualityService.dedupeGuidebooks(
      enrollments.map((e) => e.guidebook),
    );

    return {
      citizen: detail.citizen,
      demographics: demographics ?? {
        uhid: detail.citizen.uhid,
        abha: null,
        aadhaar: null,
        fullName: detail.citizen.fullName,
        dateOfBirth: null,
        age: detail.citizen.age,
        gender: detail.citizen.gender,
        mobile: detail.citizen.phone,
        address: null,
        village: null,
        district: detail.citizen.district,
      },
      programs: detail.programs.map((p) => ({ id: p.id, name: p.name })),
      enrollments,
      activities: detail.activities,
      alerts,
      guidebooks,
    };
  }

  private static toHistoryEntry(row: StatusHistoryRow): StatusHistoryEntry {
    return {
      id: row.id,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      decision: row.decision,
      comments: row.comments,
      actor: row.actor,
      createdAt: row.created_at.toISOString(),
    };
  }

  private static dedupeGuidebooks(refs: (GuidebookRef | null)[]): GuidebookRef[] {
    const seen = new Map<string, GuidebookRef>();
    for (const ref of refs) {
      if (ref && !seen.has(ref.id)) seen.set(ref.id, ref);
    }
    return Array.from(seen.values());
  }

  private static toDto(row: DuplicateRequestRow): DuplicateRequestDto {
    return {
      id: row.id,
      reference: DataQualityService.reference(row.id),
      currentPatient: {
        id: row.current_citizen_id,
        uhid: row.current_uhid,
        fullName: row.current_name,
      },
      duplicatePatient: {
        id: row.duplicate_citizen_id,
        uhid: row.duplicate_uhid,
        fullName: row.duplicate_name,
      },
      reason: row.reason,
      comments: row.comments,
      status: row.status,
      decision: row.decision,
      resolution: row.resolution,
      submittedBy: row.submitted_by,
      submittedAt: row.submitted_at.toISOString(),
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at ? row.reviewed_at.toISOString() : null,
      // Canonical review comments, falling back to the legacy remarks column.
      reviewComments: row.review_comments ?? row.remarks,
      remarks: row.review_comments ?? row.remarks,
      updatedAt: (row.updated_at ?? row.submitted_at).toISOString(),
    };
  }

  /** Derives a short, stable, human-friendly reference from the request UUID. */
  private static reference(id: string): string {
    return `DR-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  }
}
