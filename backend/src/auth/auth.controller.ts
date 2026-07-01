import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DevSwitchDto } from './dto/dev-switch.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtPayload } from './types/jwt-payload.type';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: LoginDto) {
    return this.auth.login(body.username, body.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: Request) {
    const user = (req as Request & { user: JwtPayload }).user;
    return {
      username: user.sub,
      full_name: user.name,
      role: user.role,
    };
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @Req() req: Request,
    @Body() body: ChangePasswordDto,
  ): Promise<void> {
    const user = (req as Request & { user: JwtPayload }).user;
    await this.auth.changePassword(user.sub, body.currentPassword, body.newPassword);
  }

  // ── DEV-only endpoints ────────────────────────────────────────────────────
  // Require a valid JWT so they are not publicly accessible, but do not verify
  // passwords. Remove or gate behind NODE_ENV before production deployment.

  /** Returns all active users — used to populate the Switch User menu. */
  @Get('dev/users')
  @UseGuards(JwtAuthGuard)
  async devUsers() {
    return this.auth.devListUsers();
  }

  /**
   * Issues a valid JWT for any active user without requiring their password.
   * The caller must already hold a valid JWT (any role).
   * Replaces the frontend session with the target user's full credentials.
   */
  @Post('dev/switch-user')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async devSwitchUser(@Body() body: DevSwitchDto) {
    return this.auth.devSwitchUser(body.username);
  }
}
