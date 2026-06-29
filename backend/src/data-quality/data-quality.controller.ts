import {
  Body,
  Controller,
  ForbiddenException,
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
import { DataQualityService } from './data-quality.service';
import { CreateDuplicateRequestDto } from './dto/create-duplicate-request.dto';
import { ResolveDuplicateRequestDto } from './dto/resolve-duplicate-request.dto';
import { ReviewDuplicateRequestDto } from './dto/review-duplicate-request.dto';
import {
  DuplicateComparisonDto,
  DuplicateRequestDto,
} from './data-quality.types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Data Quality API for the Duplicate Request workflow. Protected by the existing
 * JWT guard. Submitting a request is open to any authenticated healthcare worker;
 * reviewing/resolving and viewing the queue are restricted to administrators.
 */
@Controller('data-quality')
@UseGuards(JwtAuthGuard)
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
  list(@Req() req: Request): Promise<DuplicateRequestDto[]> {
    DataQualityController.requireAdmin(req);
    return this.dataQuality.listRequests();
  }

  @Get('duplicate-requests/:id/comparison')
  compare(
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<DuplicateComparisonDto> {
    DataQualityController.requireAdmin(req);
    DataQualityController.requireUuid(id);
    return this.dataQuality.compare(id);
  }

  @Post('duplicate-requests/:id/approve')
  approve(
    @Param('id') id: string,
    @Body() body: ReviewDuplicateRequestDto,
    @Req() req: Request,
  ): Promise<DuplicateRequestDto> {
    const user = DataQualityController.requireAdmin(req);
    DataQualityController.requireUuid(id);
    return this.dataQuality.approve(id, user.sub, body.remarks?.trim() || null);
  }

  @Post('duplicate-requests/:id/reject')
  reject(
    @Param('id') id: string,
    @Body() body: ReviewDuplicateRequestDto,
    @Req() req: Request,
  ): Promise<DuplicateRequestDto> {
    const user = DataQualityController.requireAdmin(req);
    DataQualityController.requireUuid(id);
    return this.dataQuality.reject(id, user.sub, body.remarks?.trim() || null);
  }

  @Post('duplicate-requests/:id/resolve')
  resolve(
    @Param('id') id: string,
    @Body() body: ResolveDuplicateRequestDto,
    @Req() req: Request,
  ): Promise<DuplicateRequestDto> {
    const user = DataQualityController.requireAdmin(req);
    DataQualityController.requireUuid(id);
    const action = body.action === 'MERGE' ? 'MERGE' : 'DELETE';
    return this.dataQuality.resolve(id, action, user.sub, body.remarks?.trim() || null);
  }

  /** Extracts the authenticated user the JWT guard attached to the request. */
  private static user(req: Request): JwtPayload {
    const user = (req as Request & { user?: JwtPayload }).user;
    if (!user) {
      throw new ForbiddenException('Authentication required.');
    }
    return user;
  }

  /** Asserts the caller is an administrator; returns the user when allowed. */
  private static requireAdmin(req: Request): JwtPayload {
    const user = DataQualityController.user(req);
    if ((user.role ?? '').toUpperCase() !== 'ADMIN') {
      throw new ForbiddenException('Administrator access is required for this action.');
    }
    return user;
  }

  private static requireUuid(id: string): void {
    if (!UUID_RE.test(id)) {
      throw new NotFoundException('Duplicate request not found.');
    }
  }
}
