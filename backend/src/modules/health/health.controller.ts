import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async getHealth() {
    const result = await this.healthService.getOverallHealth();

    if (result.status === 'error') {
      throw new ServiceUnavailableException(result);
    }

    return result;
  }

  @Get('live')
  async getLiveness() {
    return this.healthService.getLiveness();
  }

  @Get('ready')
  async getReadiness() {
    const result = await this.healthService.getReadiness();

    if (result.status === 'error') {
      throw new ServiceUnavailableException(result);
    }

    return result;
  }
}