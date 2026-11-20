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
  googleAuth(
    @Query('source') source: 'web' | 'desktop' = 'web',
    @Query('redirect_port') redirectPort: number | undefined,
    @Req() req: Request,
    @Res() res: Response
  ) {
    const reqHost = req.get('host');
    const port = redirectPort ? Number(redirectPort) : undefined;
    const url = this.authService.getGoogleAuthUrl(source, port, reqHost);
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
    const userAgent = (req.headers['user-agent'] as string | undefined) ?? '';
    const reqHost = req.get('host');
    const { redirectUrl } = await this.authService.handleGoogleCallback(
      code,
      state,
      userAgent,
      reqHost
    );
    return res.redirect(redirectUrl);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Получение данных текущего авторизованного пользователя' })
  me(@Req() req: Request): AuthUser {
    return req.authUser!;
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
    const userAgent = (req.headers['user-agent'] as string | undefined) ?? '';
    return this.authService.login(dto.email, userAgent);
  }
}
