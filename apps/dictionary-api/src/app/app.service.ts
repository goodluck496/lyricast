import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  ping() {
    return {
      ok: true,
      action: 'ping',
      pong: true,
      time: new Date().toISOString(),
    };
  }
}
