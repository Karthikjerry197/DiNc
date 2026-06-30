import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/types/jwt-payload.type';
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
 * Knowledge Hub API. Protected by the existing JWT guard. Reads are open to any
 * authenticated user; FAQ administration (create/update/delete) is admin-only.
 * All writes use POST (consistent with the existing CORS config). Emergency
 * protocols reuse the guidebooks data; no duplicate tables or logic.
 */
@Controller('knowledge')
@UseGuards(JwtAuthGuard)
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get('faqs')
  listFaqs(): Promise<FaqListDto> {
    return this.knowledge.listFaqs();
  }

  @Post('faqs')
  @HttpCode(HttpStatus.CREATED)
  createFaq(@Body() body: FaqInputDto, @Req() req: Request): Promise<FaqDto> {
    KnowledgeController.requireAdmin(req);
    return this.knowledge.createFaq(body);
  }

  @Post('faqs/:id')
  updateFaq(
    @Param('id') id: string,
    @Body() body: FaqInputDto,
    @Req() req: Request,
  ): Promise<FaqDto> {
    KnowledgeController.requireAdmin(req);
    KnowledgeController.requireUuid(id);
    return this.knowledge.updateFaq(id, body);
  }

  @Post('faqs/:id/delete')
  @HttpCode(HttpStatus.OK)
  deleteFaq(@Param('id') id: string, @Req() req: Request): Promise<{ id: string; deleted: boolean }> {
    KnowledgeController.requireAdmin(req);
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

  private static requireAdmin(req: Request): void {
    const user = (req as Request & { user?: JwtPayload }).user;
    if ((user?.role ?? '').toUpperCase() !== 'ADMIN') {
      throw new ForbiddenException('Administrator access is required.');
    }
  }

  private static requireUuid(id: string): void {
    if (!UUID_RE.test(id)) {
      throw new NotFoundException('FAQ not found.');
    }
  }
}
