import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/types/jwt-payload.type';
import { GuidebooksService } from './guidebooks.service';
import { ImportGuidebookDto } from './dto/import-guidebook.dto';
import { BulkImportGuidebooksDto } from './dto/bulk-import-guidebooks.dto';
import {
  BulkImportResult,
  GuidebookDetail,
  GuidebookListItem,
  GuidebookVersion,
} from './guidebooks.types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Guidebooks data API. Protected by the existing JWT guard (reused from
 * Milestone 1). Reads are open to any authenticated user; the single write path
 * (importing a new guidebook) is restricted to administrators.
 */
@Controller('guidebooks')
@UseGuards(JwtAuthGuard)
export class GuidebooksController {
  constructor(private readonly guidebooks: GuidebooksService) {}

  @Get('list')
  list(): Promise<GuidebookListItem[]> {
    return this.guidebooks.list();
  }

  @Get(':id')
  async detail(@Param('id') id: string): Promise<GuidebookDetail> {
    if (!UUID_RE.test(id)) {
      throw new NotFoundException('Guidebook not found');
    }
    const detail = await this.guidebooks.detail(id);
    if (!detail) {
      throw new NotFoundException('Guidebook not found');
    }
    return detail;
  }

  /** Version history for a guidebook, newest first. Any authenticated user. */
  @Get(':id/versions')
  versions(@Param('id') id: string): Promise<GuidebookVersion[]> {
    if (!UUID_RE.test(id)) {
      throw new NotFoundException('Guidebook not found');
    }
    return this.guidebooks.versions(id);
  }

  /** Import a new guidebook from a JSON payload. Administrators only. */
  @Post()
  create(
    @Body() body: ImportGuidebookDto,
    @Req() req: Request,
  ): Promise<GuidebookListItem> {
    const user = GuidebooksController.requireAdmin(req);
    return this.guidebooks.create(body, user.sub);
  }

  /** Import many guidebooks in one request. Administrators only. */
  @Post('bulk')
  bulkImport(
    @Body() body: BulkImportGuidebooksDto,
    @Req() req: Request,
  ): Promise<BulkImportResult> {
    const user = GuidebooksController.requireAdmin(req);
    return this.guidebooks.bulkImport(body.guidebooks, user.sub);
  }

  private static requireAdmin(req: Request): JwtPayload {
    const user = (req as Request & { user?: JwtPayload }).user;
    if ((user?.role ?? '').toUpperCase() !== 'ADMIN') {
      throw new ForbiddenException('Administrator access is required.');
    }
    return user as JwtPayload;
  }
}
