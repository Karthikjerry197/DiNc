import {
  Body,
  Controller,
  ForbiddenException,
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
import { WorkflowService } from './workflow.service';
import { UpdateRuleDto } from './dto/update-rule.dto';
import { WorkflowRuleDto, WorkflowRulesOverviewDto } from './workflow.types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Administration API for the Workflow Rules Engine. Protected by the existing JWT
 * guard and restricted to administrators — workflow configuration is an admin
 * concern. The engine itself is invoked internally by the Consultation module,
 * not over HTTP, so no execution endpoint is exposed.
 */
@Controller('workflow')
@UseGuards(JwtAuthGuard)
export class WorkflowController {
  constructor(private readonly workflow: WorkflowService) {}

  @Get('rules')
  getOverview(@Req() req: Request): Promise<WorkflowRulesOverviewDto> {
    WorkflowController.requireAdmin(req);
    return this.workflow.getOverview();
  }

  @Post('rules/:id')
  updateRule(
    @Param('id') id: string,
    @Body() body: UpdateRuleDto,
    @Req() req: Request,
  ): Promise<WorkflowRuleDto> {
    WorkflowController.requireAdmin(req);
    if (!UUID_RE.test(id)) {
      throw new NotFoundException('Workflow rule not found.');
    }
    return this.workflow.updateRule(id, body);
  }

  private static requireAdmin(req: Request): void {
    const user = (req as Request & { user?: JwtPayload }).user;
    if ((user?.role ?? '').toUpperCase() !== 'ADMIN') {
      throw new ForbiddenException('Administrator access is required.');
    }
  }
}
