import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ReferenceDataRepository } from './reference-data.repository';
import {
  ReferenceCategoryDto,
  ReferenceCategoryRow,
  ReferenceValueDto,
  ReferenceValueRow,
} from './reference-data.types';

/**
 * Business layer for the Reference Data framework. Exposes read APIs (with a short
 * in-memory cache — reference data is hot and rarely changes) and admin-guarded
 * writes. The cache is cleared on every write so edits are visible immediately.
 * PostgreSQL is the source of truth; this service never invents options.
 */
@Injectable()
export class ReferenceDataService {
  private readonly cache = new Map<string, { values: ReferenceValueDto[]; expiresAt: number }>();
  private static readonly TTL_MS = 30_000;

  constructor(private readonly repo: ReferenceDataRepository) {}

  // ── Reads ───────────────────────────────────────────────────────────────────

  async listCategories(activeOnly = false): Promise<ReferenceCategoryDto[]> {
    const rows = await this.repo.listCategories(activeOnly);
    return rows.map(ReferenceDataService.toCategory);
  }

  /**
   * Values for a category. Active-only lookups are cached briefly; the full
   * (admin) view is always read live so the management UI is never stale.
   */
  async listValues(idOrKey: string, activeOnly = true): Promise<ReferenceValueDto[]> {
    const key = idOrKey.toLowerCase();
    if (activeOnly) {
      const cached = this.cache.get(key);
      if (cached && cached.expiresAt > Date.now()) return cached.values;
    }

    const category = await this.repo.findCategory(idOrKey);
    if (!category) throw new NotFoundException(`Unknown reference category '${idOrKey}'.`);

    const rows = await this.repo.listValues(idOrKey, activeOnly);
    const values = rows.map(ReferenceDataService.toValue);
    if (activeOnly) {
      this.cache.set(key, { values, expiresAt: Date.now() + ReferenceDataService.TTL_MS });
    }
    return values;
  }

  // ── Validation helpers (single source of truth for backend DTO validation) ──

  /**
   * True when `code` is an active value of `category`. Lets backend services
   * validate against the Reference Data source of truth instead of a hardcoded
   * array. Unknown/empty categories resolve to false so nothing spuriously
   * validates.
   */
  async isActiveValue(category: string, code: string): Promise<boolean> {
    try {
      const values = await this.listValues(category, true);
      return values.some((v) => v.code === code);
    } catch {
      return false;
    }
  }

  /** Active value codes for a category (e.g. to populate admin option lists). */
  async activeCodes(category: string): Promise<string[]> {
    const values = await this.listValues(category, true).catch(() => []);
    return values.map((v) => v.code);
  }

  // ── Category writes ─────────────────────────────────────────────────────────

  async createCategory(input: {
    key: string;
    name: string;
    description?: string;
  }): Promise<ReferenceCategoryDto> {
    const key = (input.key ?? '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    if (!key) throw new BadRequestException('Category key must contain letters or numbers.');
    if (!input.name?.trim()) throw new BadRequestException('Category name is required.');
    if (await this.repo.findCategory(key)) {
      throw new ConflictException(`A category with key '${key}' already exists.`);
    }
    const row = await this.repo.createCategory({
      key,
      name: input.name.trim(),
      description: input.description?.trim() || null,
    });
    this.cache.clear();
    return ReferenceDataService.toCategory(row);
  }

  async updateCategory(
    idOrKey: string,
    patch: { name?: string; description?: string | null; isActive?: boolean },
  ): Promise<ReferenceCategoryDto> {
    const row = await this.repo.updateCategory(idOrKey, {
      name: patch.name?.trim(),
      description: patch.description === undefined ? undefined : (patch.description?.trim() || null),
      isActive: patch.isActive,
    });
    if (!row) throw new NotFoundException('Reference category not found.');
    this.cache.clear();
    return ReferenceDataService.toCategory(row);
  }

  async deactivateCategory(idOrKey: string): Promise<ReferenceCategoryDto> {
    const existing = await this.repo.findCategory(idOrKey);
    if (!existing) throw new NotFoundException('Reference category not found.');
    if (existing.is_system) {
      throw new ConflictException('System categories cannot be removed; deactivate individual values instead.');
    }
    const row = await this.repo.deactivateCategory(idOrKey);
    this.cache.clear();
    return ReferenceDataService.toCategory(row!);
  }

  // ── Value writes ────────────────────────────────────────────────────────────

  async createValue(
    idOrKey: string,
    input: {
      code: string;
      displayName: string;
      description?: string;
      colour?: string;
      icon?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<ReferenceValueDto> {
    const category = await this.repo.findCategory(idOrKey);
    if (!category) throw new NotFoundException(`Unknown reference category '${idOrKey}'.`);
    const code = (input.code ?? '').trim();
    if (!code) throw new BadRequestException('Value code is required.');
    if (!input.displayName?.trim()) throw new BadRequestException('Display name is required.');
    if (await this.repo.valueCodeExists(category.id, code)) {
      throw new ConflictException(`Code '${code}' already exists in this category.`);
    }
    const row = await this.repo.createValue(category.id, {
      code,
      displayName: input.displayName.trim(),
      description: input.description?.trim() || null,
      colour: input.colour?.trim() || null,
      icon: input.icon?.trim() || null,
      metadata: input.metadata ?? {},
    });
    this.cache.clear();
    return ReferenceDataService.toValue({ ...row, category_key: category.key });
  }

  async updateValue(
    id: string,
    patch: {
      displayName?: string;
      description?: string | null;
      colour?: string | null;
      icon?: string | null;
      isActive?: boolean;
      metadata?: Record<string, unknown>;
    },
  ): Promise<ReferenceValueDto> {
    const row = await this.repo.updateValue(id, {
      displayName: patch.displayName?.trim(),
      description: patch.description === undefined ? undefined : (patch.description?.trim() || null),
      colour: patch.colour === undefined ? undefined : (patch.colour?.trim() || null),
      icon: patch.icon === undefined ? undefined : (patch.icon?.trim() || null),
      isActive: patch.isActive,
      metadata: patch.metadata,
    });
    if (!row) throw new NotFoundException('Reference value not found.');
    this.cache.clear();
    return ReferenceDataService.toValue(row);
  }

  async deactivateValue(id: string): Promise<ReferenceValueDto> {
    const row = await this.repo.deactivateValue(id);
    if (!row) throw new NotFoundException('Reference value not found.');
    this.cache.clear();
    return ReferenceDataService.toValue(row);
  }

  async reorderValues(idOrKey: string, orderedIds: string[]): Promise<ReferenceValueDto[]> {
    const category = await this.repo.findCategory(idOrKey);
    if (!category) throw new NotFoundException(`Unknown reference category '${idOrKey}'.`);
    await this.repo.reorderValues(category.id, orderedIds);
    this.cache.clear();
    return this.listValues(idOrKey, false);
  }

  // ── Mappers ─────────────────────────────────────────────────────────────────

  private static toCategory(row: ReferenceCategoryRow): ReferenceCategoryDto {
    return {
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description,
      isActive: row.is_active,
      isSystem: row.is_system,
      displayOrder: row.display_order,
      valueCount: Number(row.value_count ?? 0),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private static toValue(row: ReferenceValueRow): ReferenceValueDto {
    return {
      id: row.id,
      categoryId: row.category_id,
      categoryKey: row.category_key ?? '',
      code: row.code,
      displayName: row.display_name,
      description: row.description,
      colour: row.colour,
      icon: row.icon,
      sortOrder: row.sort_order,
      isActive: row.is_active,
      isSystem: row.is_system,
      metadata: row.metadata ?? {},
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
