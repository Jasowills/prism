import { Module } from '@nestjs/common';
import { PrismService } from './prism.service.js';
import { ApiController } from './api.controller.js';
import { WebhookController } from './webhook.controller.js';
import { HealthController } from './health.controller.js';

@Module({
  controllers: [ApiController, WebhookController, HealthController],
  providers: [PrismService],
  exports: [PrismService],
})
export class AppModule {}
