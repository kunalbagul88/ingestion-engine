import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DataSource } from 'typeorm';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  @ApiOperation({
    summary: 'Health check',
    description: 'Returns the health status of the API and database connection.',
  })
  @ApiResponse({
    status: 200,
    description: 'Service is healthy',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        timestamp: { type: 'string', example: '2026-02-12T10:30:00.000Z' },
        database: { type: 'string', example: 'connected' },
        uptime: { type: 'number', example: 3600 },
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: 'Service is unhealthy',
  })
  async check() {
    let dbStatus = 'disconnected';
    
    try {
      if (this.dataSource.isInitialized) {
        await this.dataSource.query('SELECT 1');
        dbStatus = 'connected';
      }
    } catch (error) {
      dbStatus = `error: ${error.message}`;
    }

    return {
      status: dbStatus === 'connected' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      database: dbStatus,
      uptime: process.uptime(),
      version: '1.0.0',
    };
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Readiness check',
    description: 'Returns whether the service is ready to accept traffic.',
  })
  async ready() {
    const isDbReady = this.dataSource.isInitialized;
    
    if (!isDbReady) {
      return {
        status: 'not_ready',
        reason: 'Database not initialized',
      };
    }

    return {
      status: 'ready',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('live')
  @ApiOperation({
    summary: 'Liveness check',
    description: 'Returns whether the service process is alive.',
  })
  async live() {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
      pid: process.pid,
      memory: process.memoryUsage(),
    };
  }
}
