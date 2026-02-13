import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { AnalyticsService } from '../services/analytics.service';
import {
  PerformanceAnalyticsResponseDto,
  AnalyticsQueryDto,
  FleetEfficiencyDto,
} from '../../../dto';

@ApiTags('analytics')
@Controller('v1/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * GET /v1/analytics/performance/:vehicleId
   * 
   * Returns 24-hour performance summary for a specific vehicle:
   * - Total energy consumed (AC) vs. delivered (DC)
   * - Efficiency Ratio (DC/AC)
   * - Average battery temperature
   * 
   * PERFORMANCE NOTE: This query uses indexed access on (vehicleId, timestamp)
   * and does NOT perform a full table scan.
   */
  @Get('performance/:vehicleId')
  @ApiOperation({
    summary: 'Get vehicle performance analytics',
    description: `
      Returns a 24-hour summary of vehicle charging performance including:
      - Total AC energy consumed from grid
      - Total DC energy delivered to battery
      - Efficiency ratio (DC/AC) - healthy range is 0.85-0.95
      - Battery temperature statistics
      
      The efficiency ratio indicates charger/system health:
      - Excellent: >= 92%
      - Good: 85-92%
      - Warning: 75-85% (possible inefficiency)
      - Critical: < 75% (likely hardware fault or energy leakage)
    `,
  })
  @ApiParam({
    name: 'vehicleId',
    description: 'Unique vehicle identifier',
    example: 'VH-TESLA-001',
  })
  @ApiQuery({
    name: 'hours',
    required: false,
    description: 'Analysis period in hours (default: 24)',
    example: 24,
  })
  @ApiQuery({
    name: 'meterId',
    required: false,
    description: 'Associated meter ID for correlation (auto-detected if not provided)',
    example: 'METER-001-NYC',
  })
  @ApiResponse({
    status: 200,
    description: 'Performance analytics data',
    type: PerformanceAnalyticsResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'No telemetry data found for the specified vehicle',
  })
  async getPerformance(
    @Param('vehicleId') vehicleId: string,
    @Query() query: AnalyticsQueryDto,
  ): Promise<PerformanceAnalyticsResponseDto> {
    return this.analyticsService.getPerformance(
      vehicleId,
      query.hours || 24,
      query.meterId,
    );
  }

  /**
   * Fleet-wide efficiency summary
   */
  @Get('fleet/efficiency')
  @ApiOperation({
    summary: 'Get fleet-wide efficiency summary',
    description: `
      Returns aggregated efficiency metrics for the entire fleet:
      - Total vehicles analyzed
      - Average fleet efficiency ratio
      - Count of vehicles with efficiency warnings/critical status
      - Total energy consumed vs delivered
      - Total energy loss
    `,
  })
  @ApiQuery({
    name: 'hours',
    required: false,
    description: 'Analysis period in hours (default: 24)',
    example: 24,
  })
  @ApiResponse({
    status: 200,
    description: 'Fleet efficiency summary',
    type: FleetEfficiencyDto,
  })
  async getFleetEfficiency(
    @Query('hours') hours?: number,
  ): Promise<FleetEfficiencyDto> {
    return this.analyticsService.getFleetEfficiency(hours || 24);
  }

  /**
   * Hourly efficiency trend for a vehicle
   */
  @Get('trend/:vehicleId')
  @ApiOperation({
    summary: 'Get vehicle efficiency trend',
    description: 'Returns hourly efficiency breakdown for trend analysis',
  })
  @ApiParam({
    name: 'vehicleId',
    description: 'Unique vehicle identifier',
    example: 'VH-TESLA-001',
  })
  @ApiQuery({
    name: 'hours',
    required: false,
    description: 'Analysis period in hours (default: 24)',
    example: 24,
  })
  @ApiResponse({
    status: 200,
    description: 'Hourly efficiency trend data',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          hour: { type: 'string', example: '2026-02-12T10:00:00.000Z' },
          kwhConsumedAc: { type: 'number', example: 12.5 },
          kwhDeliveredDc: { type: 'number', example: 10.625 },
          efficiencyRatio: { type: 'number', example: 0.85 },
          avgBatteryTemp: { type: 'number', example: 32.5 },
        },
      },
    },
  })
  async getEfficiencyTrend(
    @Param('vehicleId') vehicleId: string,
    @Query('hours') hours?: number,
  ) {
    return this.analyticsService.getEfficiencyTrend(vehicleId, hours || 24);
  }
}
