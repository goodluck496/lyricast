import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService, LoginResponse } from './auth.service';
import { LoginDto } from './dto/login.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Авторизация по email, выдача токена' })
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
