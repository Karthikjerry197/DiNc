import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { PASSWORD_MIN_LENGTH, SystemSettingsDto } from './system.types';

/**
 * Assembles the System Settings read-model from configuration already present
 * (ConfigService / env / package.json). Purely read-only: it holds no state,
 * writes nothing, and reuses existing configuration sources exactly as they are.
 * Secrets and implementation internals are never read or returned.
 */
@Injectable()
export class SystemService {
  constructor(private readonly config: ConfigService) {}

  getSettings(): SystemSettingsDto {
    return {
      organization: {
        name: this.config.get<string>('ORG_NAME') ?? 'National Health Mission',
        facility: this.config.get<string>('ORG_FACILITY') ?? null,
        district: this.config.get<string>('ORG_DISTRICT') ?? null,
        contactEmail: this.config.get<string>('ORG_CONTACT_EMAIL') ?? null,
      },
      application: {
        name: 'Digital Integrated Care Network (DiNC)',
        version: SystemService.appVersion(),
        environment: SystemService.friendlyEnv(this.config.get<string>('NODE_ENV')),
      },
      security: {
        // The existing token lifetime IS the session lifetime; surfaced as-is.
        sessionLifetime: this.config.get<string>('JWT_EXPIRES_IN') ?? '8h',
        passwordMinLength: PASSWORD_MIN_LENGTH,
      },
    };
  }

  private static friendlyEnv(nodeEnv: string | undefined): string {
    switch ((nodeEnv ?? 'development').toLowerCase()) {
      case 'production':
        return 'Production';
      case 'test':
        return 'Test';
      default:
        return 'Development';
    }
  }

  /** App version from package.json at runtime (never throws — falls back). */
  private static appVersion(): string {
    try {
      const pkg = readFileSync(resolve(process.cwd(), 'package.json'), 'utf8');
      return (JSON.parse(pkg) as { version?: string }).version ?? '1.0.0';
    } catch {
      return '1.0.0';
    }
  }
}
