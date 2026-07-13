import {
  Body,
  Controller,
  Get,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/types/jwt-payload.type';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { PermissionsService } from '../rbac/permissions.service';
import { DashboardService } from './dashboard.service';
import { DashboardLayoutRepository } from './dashboard-layout.repository';
import { SaveLayoutDto } from './dto/save-layout.dto';
import { AdminDashboardSummary, DashboardLayoutDto } from './dashboard.types';

type AuthedRequest = Request & { user: JwtPayload };

/**
 * Dashboard API. JWT-guarded, with authorization by the database-driven
 * {@link PermissionsGuard} (Milestone 4).
 *
 * Routes:
 *   GET  /dashboard/admin/summary  — aggregated KPIs; scoped per `dashboard.view.all`
 *   GET  /dashboard/layout          — the layout for the caller's role
 *                                    (holders of `dashboard.edit` may pass ?role=X
 *                                    to preview another role's layout)
 *   PUT  /dashboard/layout          — upsert a role's layout (requires `dashboard.edit`)
 */
@Controller('dashboard')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly layouts: DashboardLayoutRepository,
    private readonly permissions: PermissionsService,
  ) {}

  /** Permission-scoped summary: viewers without `dashboard.view.all` see only their own activities. */
  @Get('admin/summary')
  getAdminSummary(@Req() req: AuthedRequest): Promise<AdminDashboardSummary> {
    return this.dashboard.getAdminSummary({
      username: req.user.sub,
      role: req.user.role,
    });
  }

  /**
   * Returns the stored layout for the caller's role. Callers holding
   * `dashboard.edit` may pass `?role=CLINICIAN` to fetch another role's layout
   * for editing without switching their own session.
   */
  @Get('layout')
  async getLayout(
    @Req() req: AuthedRequest,
    @Query('role') queryRole?: string,
  ): Promise<DashboardLayoutDto> {
    const user = req.user;
    // Non-editors always get their own role's layout; layout editors may preview
    // another role's layout via ?role= (effective permission, resolved from DB).
    const canEdit = await this.permissions.has(user, 'dashboard.edit');
    const targetRole = queryRole && canEdit ? queryRole : user.role;

    const stored = await this.layouts.findByRole(targetRole);
    if (stored) return stored;

    // No row seeded yet for this role — return an empty layout so the frontend
    // can enter edit mode and configure it from scratch.
    return { role: targetRole, layout: [], updatedBy: null, updatedAt: null };
  }

  /** Saves a role's widget layout. Requires the `dashboard.edit` permission. */
  @Put('layout')
  @RequirePermissions('dashboard.edit')
  async saveLayout(
    @Req() req: AuthedRequest,
    @Body() body: SaveLayoutDto,
  ): Promise<{ success: boolean }> {
    await this.layouts.upsert(body.role, body.layout, req.user.sub);
    return { success: true };
  }
}
