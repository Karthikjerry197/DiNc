import {
  Body,
  Controller,
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
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
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
 * Guidebooks data API. JWT-guarded, with per-route authorization by the
 * database-driven {@link PermissionsGuard} (Milestone 4). Reads are open to any
 * authenticated user; the write paths (importing guidebooks) require the
 * `admin.pages` permission (Access Administration).
 */
@Controller('guidebooks')
@UseGuards(JwtAuthGuard, PermissionsGuard)
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

  /** Import a new guidebook from a JSON payload. Requires `admin.pages`. */
  @Post()
  @RequirePermissions('admin.pages')
  create(
    @Body() body: ImportGuidebookDto,
    @Req() req: Request,
  ): Promise<GuidebookListItem> {
    const user = (req as Request & { user: JwtPayload }).user;
    return this.guidebooks.create(body, user.sub);
  }

  /** Import many guidebooks in one request. Requires `admin.pages`. */
  @Post('bulk')
  @RequirePermissions('admin.pages')
  bulkImport(
    @Body() body: BulkImportGuidebooksDto,
    @Req() req: Request,
  ): Promise<BulkImportResult> {
    const user = (req as Request & { user: JwtPayload }).user;
    return this.guidebooks.bulkImport(body.guidebooks, user.sub);
  }
}
