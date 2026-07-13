import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { ReferenceDataService } from './reference-data.service';
import {
  CreateCategoryDto,
  CreateValueDto,
  ReorderValuesDto,
  UpdateCategoryDto,
  UpdateValueDto,
} from './dto/reference-data.dto';
import { ReferenceCategoryDto, ReferenceValueDto } from './reference-data.types';

/**
 * Reference Data API.
 *
 * Reads are open to any authenticated user (dropdowns everywhere need them);
 * writes require the `admin.pages` permission and go through the database-driven
 * {@link PermissionsGuard}. `DELETE` is a SOFT delete (deactivation) — reference
 * data is never physically removed, preserving historical values already stored
 * on records.
 */
@Controller('reference-data')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReferenceDataController {
  constructor(private readonly service: ReferenceDataService) {}

  // ── Reads ───────────────────────────────────────────────────────────────────

  @Get('categories')
  categories(@Query('activeOnly') activeOnly?: string): Promise<ReferenceCategoryDto[]> {
    return this.service.listCategories(activeOnly === 'true');
  }

  @Get(':category')
  values(
    @Param('category') category: string,
    @Query('activeOnly') activeOnly?: string,
  ): Promise<ReferenceValueDto[]> {
    // Default active-only true (consumers want selectable options); admins pass
    // activeOnly=false to see deactivated values in the management workspace.
    return this.service.listValues(category, activeOnly !== 'false');
  }

  // ── Category writes (admin) ─────────────────────────────────────────────────

  @Post('categories')
  @RequirePermissions('admin.pages')
  createCategory(@Body() body: CreateCategoryDto): Promise<ReferenceCategoryDto> {
    return this.service.createCategory(body);
  }

  @Put('categories/:idOrKey')
  @RequirePermissions('admin.pages')
  updateCategory(
    @Param('idOrKey') idOrKey: string,
    @Body() body: UpdateCategoryDto,
  ): Promise<ReferenceCategoryDto> {
    return this.service.updateCategory(idOrKey, body);
  }

  @Delete('categories/:idOrKey')
  @RequirePermissions('admin.pages')
  deactivateCategory(@Param('idOrKey') idOrKey: string): Promise<ReferenceCategoryDto> {
    return this.service.deactivateCategory(idOrKey);
  }

  // ── Value writes (admin) ────────────────────────────────────────────────────

  @Post(':category/values')
  @RequirePermissions('admin.pages')
  createValue(
    @Param('category') category: string,
    @Body() body: CreateValueDto,
  ): Promise<ReferenceValueDto> {
    return this.service.createValue(category, body);
  }

  @Put(':category/reorder')
  @RequirePermissions('admin.pages')
  reorder(
    @Param('category') category: string,
    @Body() body: ReorderValuesDto,
  ): Promise<ReferenceValueDto[]> {
    return this.service.reorderValues(category, body.orderedIds);
  }

  @Put('values/:id')
  @RequirePermissions('admin.pages')
  updateValue(
    @Param('id') id: string,
    @Body() body: UpdateValueDto,
  ): Promise<ReferenceValueDto> {
    return this.service.updateValue(id, body);
  }

  @Delete('values/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('admin.pages')
  deactivateValue(@Param('id') id: string): Promise<ReferenceValueDto> {
    return this.service.deactivateValue(id);
  }
}
