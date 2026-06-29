import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CitizensService } from './citizens.service';
import { CreateCitizenDto } from './dto/create-citizen.dto';
import { BulkUploadDto } from './dto/bulk-upload.dto';
import {
  BulkUploadResult,
  CitizenDetail,
  CitizenListItem,
  CreateCitizenInput,
} from './citizens.types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Trims a DTO into the normalised insert input (empty optionals → null). */
function toInput(dto: CreateCitizenDto): CreateCitizenInput {
  const clean = (v?: string): string | null => (v && v.trim() ? v.trim() : null);
  return {
    uhid: dto.uhid.trim(),
    fullName: dto.fullName.trim(),
    age: dto.age ?? null,
    gender: clean(dto.gender),
    phone: clean(dto.phone),
    district: clean(dto.district),
  };
}

/**
 * Citizen Workspace API. Protected by the existing JWT guard. Reads power the
 * Citizen Workspace (Milestone 4); the write endpoints back the single Patient
 * Registration and Bulk Upload workflows reused across Dashboard, Citizens and
 * Worklist.
 */
@Controller('citizens')
@UseGuards(JwtAuthGuard)
export class CitizensController {
  constructor(private readonly citizens: CitizensService) {}

  @Get('list')
  list(): Promise<CitizenListItem[]> {
    return this.citizens.list();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: CreateCitizenDto): Promise<CitizenListItem> {
    return this.citizens.create(toInput(body));
  }

  @Post('bulk')
  @HttpCode(HttpStatus.CREATED)
  bulk(@Body() body: BulkUploadDto): Promise<BulkUploadResult> {
    return this.citizens.bulkCreate(body.patients.map(toInput));
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
