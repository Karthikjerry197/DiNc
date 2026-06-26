import {
  Controller,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GuidebooksService } from './guidebooks.service';
import { GuidebookDetail, GuidebookListItem } from './guidebooks.types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Guidebooks data API. Protected by the existing JWT guard (reused from
 * Milestone 1). Read-only — no writes are ever performed.
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
}
