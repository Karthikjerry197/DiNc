import {
  Controller,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GuidebookRef } from '../guidebooks/guidebooks.types';
import { WorklistService } from './worklist.service';
import { WorklistOverview } from './worklist.types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Worklist data API. Protected by the existing JWT guard (reused from Milestone 1).
 * Namespaced under `admin/` so future role-specific worklist views can be added
 * without disturbing this one.
 */
@Controller('worklist')
@UseGuards(JwtAuthGuard)
export class WorklistController {
  constructor(private readonly worklist: WorklistService) {}

  @Get('admin/overview')
  getAdminOverview(): Promise<WorklistOverview> {
    return this.worklist.getAdminOverview();
  }

  @Get('items/:itemId/guidebook')
  getItemGuidebook(
    @Param('itemId') itemId: string,
  ): Promise<{ guidebook: GuidebookRef | null }> {
    if (!UUID_RE.test(itemId)) {
      throw new NotFoundException('Worklist item not found');
    }
    return this.worklist.getGuidebookForItem(itemId);
  }
}
