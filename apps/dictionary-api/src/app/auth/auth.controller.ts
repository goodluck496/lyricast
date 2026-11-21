import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthService, AuthUser, LoginResponse } from './auth.service';
import { AuthGuard } from './auth.guard';
import { LoginDto } from './dto/login.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('google')
  @ApiOperation({ summary: 'Инициация Google OAuth 2.0 авторизации' })
  @ApiQuery({ name: 'source', required: false, enum: ['web', 'desktop'] })
  @ApiQuery({ name: 'redirect_port', required: false, type: Number })
  @ApiQuery({ name: 'redirect_url', required: false, type: String })
  @ApiQuery({ name: 'return_path', required: false, type: String })
  googleAuth(
    @Query('source') source: 'web' | 'desktop' = 'web',
    @Query('redirect_port') redirectPort: number | undefined,
    @Query('redirect_url') redirectUrl: string | undefined,
    @Query('return_path') returnPath: string | undefined,
    @Req() req: Request,
    @Res() res: Response
  ) {
    const reqHost = req.get('host');
    const port = redirectPort ? Number(redirectPort) : undefined;
    const referer = req.headers['referer'] || req.headers['origin'];
    const clientRedirect = redirectUrl || (typeof referer === 'string' ? referer : undefined);
    const url = this.authService.getGoogleAuthUrl(source, port, reqHost, clientRedirect, returnPath);
    return res.redirect(url);
  }

  @Get('google/callback')
  @ApiOperation({ summary: 'Callback от Google OAuth 2.0' })
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response
  ) {
    const userAgentHeader = req.headers['user-agent'];
    const userAgent = typeof userAgentHeader === 'string' ? userAgentHeader : '';

    const cfIp = req.headers['cf-connecting-ip'];
    const xFwd = req.headers['x-forwarded-for'];
    const ip =
      (typeof cfIp === 'string'
        ? cfIp
        : typeof xFwd === 'string'
        ? xFwd.split(',')[0].trim()
        : req.ip) || '';

    const cfCountry = req.headers['cf-ipcountry'];
    const xCountry = req.headers['x-country'];
    const country =
      (typeof cfCountry === 'string'
        ? cfCountry
        : typeof xCountry === 'string'
        ? xCountry
        : '') || '';

    const cfCity = req.headers['cf-ipcity'];
    const city = typeof cfCity === 'string' ? cfCity : '';

    const reqHost = req.get('host');
    const { redirectUrl } = await this.authService.handleGoogleCallback(code, state, {
      ip,
      country,
      city,
      userAgent,
      reqHost,
    });
    return res.redirect(redirectUrl);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Получение данных текущего авторизованного пользователя' })
  me(@Req() req: Request): AuthUser {
    return req.authUser!;
  }

  @Get('users')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Получение списка пользователей для назначения доступа к справочникам' })
  async getUsers(): Promise<Array<{ id: number; email: string; name?: string }>> {
    return this.authService.listUsers();
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Авторизация по email (legacy/dev)' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        token: { type: 'string' },
        userId: { type: 'integer' },
        deviceId: { type: 'integer' },
        expiresIn: { type: 'integer' },
      },
      required: ['ok', 'token', 'userId', 'deviceId', 'expiresIn'],
    },
  })
  async login(@Body() dto: LoginDto, @Req() req: Request): Promise<LoginResponse> {
    const userAgentHeader = req.headers['user-agent'];
    const userAgent = typeof userAgentHeader === 'string' ? userAgentHeader : '';
    return this.authService.login(dto.email, userAgent);
  }
}
