import {
  Controller,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CitizensService } from './citizens.service';
import { CitizenDetail, CitizenListItem } from './citizens.types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Citizen Workspace data API. Protected by the existing JWT guard (reused from
 * Milestone 1). Read-only — no writes are ever performed.
 */
@Controller('citizens')
@UseGuards(JwtAuthGuard)
export class CitizensController {
  constructor(private readonly citizens: CitizensService) {}

  @Get('list')
  list(): Promise<CitizenListItem[]> {
    return this.citizens.list();
  }

  @Get(':id')
  async detail(@Param('id') id: string): Promise<CitizenDetail> {
    if (!UUID_RE.test(id)) {
      throw new NotFoundException('Citizen not found');
    }
    const detail = await this.citizens.detail(id);
    if (!detail) {
      throw new NotFoundException('Citizen not found');
    }
    return detail;
  }
}
