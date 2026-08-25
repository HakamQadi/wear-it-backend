import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  health() {
    return { status: 'ok', service: 'wear-it-api', timestamp: new Date().toISOString() };
  }
}
