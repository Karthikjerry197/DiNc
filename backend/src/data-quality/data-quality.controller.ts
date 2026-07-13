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
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { DataQualityService } from './data-quality.service';
import { CreateDuplicateRequestDto } from './dto/create-duplicate-request.dto';
import { DecideDuplicateRequestDto } from './dto/decide-duplicate-request.dto';
import { ResolveDuplicateRequestDto } from './dto/resolve-duplicate-request.dto';
import { ReviewDuplicateRequestDto } from './dto/review-duplicate-request.dto';
import {
  DuplicateComparisonDto,
  DuplicateDecision,
  DuplicateRequestDto,
} from './data-quality.types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Data Quality API for the Duplicate Request workflow. JWT-guarded, with per-route
 * authorization by the database-driven {@link PermissionsGuard} (Milestone 4).
 * Submitting a request is open to any authenticated healthcare worker; reviewing,
 * resolving, and viewing the queue require the `admin.data-quality` permission
 * (Data Quality Tools).
 */
@Controller('data-quality')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DataQualityController {
  constructor(private readonly dataQuality: DataQualityService) {}

  @Post('duplicate-requests')
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() body: CreateDuplicateRequestDto,
    @Req() req: Request,
  ): Promise<DuplicateRequestDto> {
    const user = DataQualityController.user(req);
    return this.dataQuality.createRequest(body, user.sub);
  }

  @Get('duplicate-requests')
  @RequirePermissions('admin.data-quality')
  list(): Promise<DuplicateRequestDto[]> {
    return this.dataQuality.listRequests();
  }

  @Get('duplicate-requests/:id/comparison')
  @RequirePermissions('admin.data-quality')
  compare(@Param('id') id: string): Promise<DuplicateComparisonDto> {
    DataQualityController.requireUuid(id);
    return this.dataQuality.compare(id);
  }

  @Post('duplicate-requests/:id/approve')
  @RequirePermissions('admin.data-quality')
  approve(
    @Param('id') id: string,
    @Body() body: ReviewDuplicateRequestDto,
    @Req() req: Request,
  ): Promise<DuplicateRequestDto> {
    DataQualityController.requireUuid(id);
    const user = DataQualityController.user(req);
    return this.dataQuality.approve(id, user.sub, body.remarks?.trim() || null);
  }

  @Post('duplicate-requests/:id/reject')
  @RequirePermissions('admin.data-quality')
  reject(
    @Param('id') id: string,
    @Body() body: ReviewDuplicateRequestDto,
    @Req() req: Request,
  ): Promise<DuplicateRequestDto> {
    DataQualityController.requireUuid(id);
    const user = DataQualityController.user(req);
    return this.dataQuality.reject(id, user.sub, body.remarks?.trim() || null);
  }

  /**
   * Administrator Review decision (Duplicate Review Workspace). One endpoint for
   * all three outcomes — reject, valid multiple-programme enrolment, or confirmed
   * duplicate. Confirmed duplicates are NOT archived/merged here (future milestone).
   */
  @Post('duplicate-requests/:id/decision')
  @RequirePermissions('admin.data-quality')
  decide(
    @Param('id') id: string,
    @Body() body: DecideDuplicateRequestDto,
    @Req() req: Request,
  ): Promise<DuplicateRequestDto> {
    DataQualityController.requireUuid(id);
    const user = DataQualityController.user(req);
    return this.dataQuality.decide(
      id,
      body.decision as DuplicateDecision,
      user.sub,
      body.comments,
    );
  }

  @Post('duplicate-requests/:id/resolve')
  @RequirePermissions('admin.data-quality')
  resolve(
    @Param('id') id: string,
    @Body() body: ResolveDuplicateRequestDto,
    @Req() req: Request,
  ): Promise<DuplicateRequestDto> {
    DataQualityController.requireUuid(id);
    const user = DataQualityController.user(req);
    const action = body.action === 'MERGE' ? 'MERGE' : 'DELETE';
    return this.dataQuality.resolve(id, action, user.sub, body.remarks?.trim() || null);
  }

  /** Extracts the authenticated user the JWT guard attached to the request. */
  private static user(req: Request): JwtPayload {
    return (req as Request & { user: JwtPayload }).user;
  }

  private static requireUuid(id: string): void {
    if (!UUID_RE.test(id)) {
      throw new NotFoundException('Duplicate request not found.');
    }
  }
}
