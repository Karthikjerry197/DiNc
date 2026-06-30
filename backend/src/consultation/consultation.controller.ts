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
import { ConsultationService } from './consultation.service';
import { SaveConsultationDto } from './dto/save-consultation.dto';
import { UpsertNoteDto } from './dto/upsert-note.dto';
import {
  ActiveActivityDto,
  ClinicalJourneyEntryDto,
  ConsultationContextDto,
  ConsultationHistoryEntryDto,
  ConsultationNoteDto,
  SaveConsultationResultDto,
  StartCallResultDto,
  TimelineEntryDto,
} from './consultation.types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * HTTP layer for the Teleconsultation / Clinical Activity engine. Holds no SQL
 * and no business logic — validates path params, extracts the authenticated user
 * the JWT guard attached, and delegates to the service. Protected by the existing
 * JWT guard. All writes use POST (consistent with the existing CORS config).
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class ConsultationController {
  constructor(private readonly consultation: ConsultationService) {}

  @Get('activities/:activityId/consultation')
  getContext(
    @Param('activityId') activityId: string,
  ): Promise<ConsultationContextDto> {
    ConsultationController.requireUuid(activityId);
    return this.consultation.getContext(activityId);
  }

  @Post('activities/:activityId/start-call')
  startCall(
    @Param('activityId') activityId: string,
    @Req() req: Request,
  ): Promise<StartCallResultDto> {
    ConsultationController.requireUuid(activityId);
    return this.consultation.startCall(activityId, ConsultationController.user(req));
  }

  @Post('activities/:activityId/consultation')
  @HttpCode(HttpStatus.CREATED)
  save(
    @Param('activityId') activityId: string,
    @Body() body: SaveConsultationDto,
    @Req() req: Request,
  ): Promise<SaveConsultationResultDto> {
    ConsultationController.requireUuid(activityId);
    return this.consultation.save(activityId, body, ConsultationController.user(req));
  }

  /** Returns the current DRAFT note for an activity (for workspace resume). */
  @Get('activities/:activityId/consultation-note')
  getNote(
    @Param('activityId') activityId: string,
  ): Promise<ConsultationNoteDto | null> {
    ConsultationController.requireUuid(activityId);
    return this.consultation.getConsultationNote(activityId);
  }

  /** Upserts a DRAFT note (auto-save from the consultation workspace). */
  @Post('activities/:activityId/consultation-note')
  @HttpCode(HttpStatus.OK)
  upsertNote(
    @Param('activityId') activityId: string,
    @Body() body: UpsertNoteDto,
    @Req() req: Request,
  ): Promise<ConsultationNoteDto> {
    ConsultationController.requireUuid(activityId);
    return this.consultation.upsertDraftNote(
      activityId,
      body.generatedNote,
      ConsultationController.user(req),
    );
  }

  /**
   * Returns the full Clinical Journey for a citizen: a unified, reverse-
   * chronological view of enrollments, consultations, and activities, each
   * with available outcome and note details. Read-only; no writes occur.
   */
  @Get('citizens/:citizenId/clinical-journey')
  getClinicalJourney(
    @Param('citizenId') citizenId: string,
  ): Promise<ClinicalJourneyEntryDto[]> {
    if (!UUID_RE.test(citizenId)) {
      throw new NotFoundException('Citizen not found');
    }
    return this.consultation.getClinicalJourney(citizenId);
  }

  /**
   * Returns the first pending/active worklist activity for a citizen, or null.
   * Called by the Citizens module before opening the Consultation Workspace to
   * determine whether a scheduled consultation already exists.
   */
  @Get('citizens/:citizenId/active-activity')
  getActiveActivity(
    @Param('citizenId') citizenId: string,
  ): Promise<ActiveActivityDto | null> {
    if (!UUID_RE.test(citizenId)) {
      throw new NotFoundException('Citizen not found');
    }
    return this.consultation.getActiveActivity(citizenId);
  }

  /** Enriched consultation history for the workspace history panel. */
  @Get('citizens/:citizenId/consultation-history')
  getConsultationHistory(
    @Param('citizenId') citizenId: string,
  ): Promise<ConsultationHistoryEntryDto[]> {
    if (!UUID_RE.test(citizenId)) {
      throw new NotFoundException('Citizen not found');
    }
    return this.consultation.getConsultationHistory(citizenId);
  }

  @Get('citizens/:citizenId/timeline')
  getTimeline(
    @Param('citizenId') citizenId: string,
  ): Promise<TimelineEntryDto[]> {
    if (!UUID_RE.test(citizenId)) {
      throw new NotFoundException('Citizen not found');
    }
    return this.consultation.getTimeline(citizenId);
  }

  private static requireUuid(activityId: string): void {
    if (!UUID_RE.test(activityId)) {
      throw new NotFoundException('Activity not found');
    }
  }

  private static user(req: Request): string | null {
    return (req as Request & { user?: JwtPayload }).user?.sub ?? null;
  }
}
