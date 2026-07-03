import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/types/jwt-payload.type';
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

  /** Permission-scoped overview: viewers without `worklist.view.all` see only their own items. */
  @Get('admin/overview')
  getAdminOverview(@Req() req: Request): Promise<WorklistOverview> {
    const user = (req as Request & { user: JwtPayload }).user;
    return this.worklist.getAdminOverview({
      username: user.sub,
      role: user.role,
    });
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
