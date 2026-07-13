import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { WorkflowService } from './workflow.service';
import { UpdateRuleDto } from './dto/update-rule.dto';
import { WorkflowRuleDto, WorkflowRulesOverviewDto } from './workflow.types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Administration API for the Workflow Rules Engine. JWT-guarded and — since the
 * Milestone 4 enforcement flip — authorized by the database-driven
 * {@link PermissionsGuard} against the `admin.workflow` permission (Workflow
 * Configuration). The engine itself is invoked internally by the Consultation
 * module, not over HTTP, so no execution endpoint is exposed.
 */
@Controller('workflow')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('admin.workflow')
export class WorkflowController {
  constructor(private readonly workflow: WorkflowService) {}

  @Get('rules')
  getOverview(): Promise<WorkflowRulesOverviewDto> {
    return this.workflow.getOverview();
  }

  @Post('rules/:id')
  updateRule(
    @Param('id') id: string,
    @Body() body: UpdateRuleDto,
  ): Promise<WorkflowRuleDto> {
    if (!UUID_RE.test(id)) {
      throw new NotFoundException('Workflow rule not found.');
    }
    return this.workflow.updateRule(id, body);
  }
}
