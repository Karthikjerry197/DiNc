import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/types/jwt-payload.type';
import { RegistrationService } from './registration.service';
import { RegisterPatientDto } from './dto/register-patient.dto';
import { CheckDuplicatesDto } from './dto/check-duplicates.dto';
import { BulkRegisterDto } from './dto/bulk-register.dto';
import {
  BulkRegistrationResultDto,
  DuplicateCheckResult,
  RegistrationOptionsDto,
  RegistrationResultDto,
} from './registration.types';

/**
 * Integrated Patient Registration API. Protected by the existing JWT guard. The
 * canonical registration workflow (single + bulk) used by Dashboard, Citizens and
 * Worklist. All writes use POST (consistent with the existing CORS config).
 */
@Controller('registration')
@UseGuards(JwtAuthGuard)
export class RegistrationController {
  constructor(private readonly registration: RegistrationService) {}

  @Get('options')
  options(): Promise<RegistrationOptionsDto> {
    return this.registration.getOptions();
  }

  @Post('check-duplicates')
  @HttpCode(HttpStatus.OK)
  checkDuplicates(@Body() body: CheckDuplicatesDto): Promise<DuplicateCheckResult> {
    return this.registration.checkDuplicates(body.uhid, body.phone, body.aadhaar);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  register(
    @Body() body: RegisterPatientDto,
    @Req() req: Request,
  ): Promise<RegistrationResultDto> {
    return this.registration.register(body, RegistrationController.user(req));
  }

  @Post('bulk')
  @HttpCode(HttpStatus.CREATED)
  bulk(
    @Body() body: BulkRegisterDto,
    @Req() req: Request,
  ): Promise<BulkRegistrationResultDto> {
    return this.registration.bulkRegister(body, RegistrationController.user(req));
  }

  private static user(req: Request): string | null {
    return (req as Request & { user?: JwtPayload }).user?.sub ?? null;
  }
}
