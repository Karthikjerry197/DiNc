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
import {
  ConsultationContextDto,
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
