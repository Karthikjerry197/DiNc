import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

/**
 * Users module: the repository (sole owner of users SQL, reused by Auth) plus
 * the Users & Roles administration API. AuthModule imports this module for the
 * repository while this module needs AuthModule's JwtAuthGuard — a module-level
 * cycle resolved with forwardRef on both sides (no provider-level cycle exists).
 */
@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [UsersController],
  providers: [UsersRepository, UsersService],
  exports: [UsersRepository],
})
export class UsersModule {}
