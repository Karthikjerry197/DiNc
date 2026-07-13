import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { KnowledgeService } from './knowledge.service';
import { FaqDto as FaqInputDto } from './dto/faq.dto';
import {
  EmergencyProtocolDto,
  FaqDto,
  FaqListDto,
  KnowledgeSearchResultDto,
  TrainingModuleDto,
} from './knowledge.types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Knowledge Hub API. JWT-guarded, with per-route authorization by the
 * database-driven {@link PermissionsGuard} (Milestone 4). Reads are open to any
 * authenticated user; FAQ administration (create/update/delete) requires the
 * `admin.pages` permission (Access Administration). All writes use POST
 * (consistent with the existing CORS config). Emergency protocols reuse the
 * guidebooks data; no duplicate tables or logic.
 */
@Controller('knowledge')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get('faqs')
  listFaqs(): Promise<FaqListDto> {
    return this.knowledge.listFaqs();
  }

  @Post('faqs')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('admin.pages')
  createFaq(@Body() body: FaqInputDto): Promise<FaqDto> {
    return this.knowledge.createFaq(body);
  }

  @Post('faqs/:id')
  @RequirePermissions('admin.pages')
  updateFaq(
    @Param('id') id: string,
    @Body() body: FaqInputDto,
  ): Promise<FaqDto> {
    KnowledgeController.requireUuid(id);
    return this.knowledge.updateFaq(id, body);
  }

  @Post('faqs/:id/delete')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('admin.pages')
  deleteFaq(@Param('id') id: string): Promise<{ id: string; deleted: boolean }> {
    KnowledgeController.requireUuid(id);
    return this.knowledge.deleteFaq(id);
  }

  @Get('training')
  listTraining(): Promise<TrainingModuleDto[]> {
    return this.knowledge.listTraining();
  }

  @Get('emergency')
  emergency(): Promise<EmergencyProtocolDto[]> {
    return this.knowledge.emergencyProtocols();
  }

  @Get('search')
  search(@Query('q') q: string): Promise<KnowledgeSearchResultDto> {
    return this.knowledge.search(q ?? '');
  }

  private static requireUuid(id: string): void {
    if (!UUID_RE.test(id)) {
      throw new NotFoundException('FAQ not found.');
    }
  }
}
