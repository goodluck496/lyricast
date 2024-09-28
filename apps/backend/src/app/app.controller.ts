import { Controller, Get, HttpStatus } from '@nestjs/common';

import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('ok')
  heartBeat() {
    return HttpStatus.OK;
  }
}
