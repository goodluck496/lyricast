import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('ping')
  @ApiOperation({ summary: 'Проверка доступности API' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        action: { type: 'string' },
        pong: { type: 'boolean' },
        time: { type: 'string', format: 'date-time' },
      },
      required: ['ok', 'action', 'pong', 'time'],
    },
  })
  ping() {
    return this.appService.ping();
  }
}
