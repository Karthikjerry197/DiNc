import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/types/jwt-payload.type';
import { DashboardService } from './dashboard.service';
import { DashboardLayoutRepository } from './dashboard-layout.repository';
import { SaveLayoutDto } from './dto/save-layout.dto';
import { AdminDashboardSummary, DashboardLayoutDto } from './dashboard.types';

type AuthedRequest = Request & { user: JwtPayload };

/**
 * Dashboard API.
 *
 * Routes:
 *   GET  /dashboard/admin/summary  — aggregated KPIs for the admin dashboard widget
 *   GET  /dashboard/layout          — the layout for the caller's role
 *                                    (admins may pass ?role=X to preview another role)
 *   PUT  /dashboard/layout          — upsert a role's layout (admin-only)
 */
@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly layouts: DashboardLayoutRepository,
  ) {}

  @Get('admin/summary')
  getAdminSummary(): Promise<AdminDashboardSummary> {
    return this.dashboard.getAdminSummary();
  }

  /**
   * Returns the stored layout for the caller's role.
   * Administrators may pass `?role=CLINICIAN` to fetch another role's layout
   * for editing without switching their own session.
   */
  @Get('layout')
  async getLayout(
    @Req() req: AuthedRequest,
    @Query('role') queryRole?: string,
  ): Promise<DashboardLayoutDto> {
    const user = req.user;
    // Non-admins always get their own role's layout.
    const targetRole =
      queryRole && user.role === 'ADMIN' ? queryRole : user.role;

    const stored = await this.layouts.findByRole(targetRole);
    if (stored) return stored;

    // No row seeded yet for this role — return an empty layout so the frontend
    // can enter edit mode and configure it from scratch.
    return { role: targetRole, layout: [], updatedBy: null, updatedAt: null };
  }

  /** Saves a role's widget layout. Restricted to ADMIN users. */
  @Put('layout')
  async saveLayout(
    @Req() req: AuthedRequest,
    @Body() body: SaveLayoutDto,
  ): Promise<{ success: boolean }> {
    if (req.user.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Only administrators can update dashboard layouts.',
      );
    }
    await this.layouts.upsert(body.role, body.layout, req.user.sub);
    return { success: true };
  }
}
