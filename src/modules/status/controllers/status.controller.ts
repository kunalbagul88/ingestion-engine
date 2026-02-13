import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { StatusService } from '../services/status.service';

@ApiTags('status')
@Controller('v1/status')
export class StatusController {
  constructor(private readonly statusService: StatusService) {}

  /**
   * Get fleet overview - dashboard primary endpoint
   */
  @Get('overview')
  @ApiOperation({
    summary: 'Get fleet overview statistics',
    description:
      'Returns aggregated real-time statistics for the entire fleet. This endpoint queries the hot store for fast response times.',
  })
  @ApiResponse({
    status: 200,
    description: 'Fleet overview statistics',
    schema: {
      type: 'object',
      properties: {
        totalMeters: { type: 'number', example: 10000 },
        onlineMeters: { type: 'number', example: 9850 },
        offlineMeters: { type: 'number', example: 150 },
        totalVehicles: { type: 'number', example: 10000 },
        chargingVehicles: { type: 'number', example: 2500 },
        idleVehicles: { type: 'number', example: 7500 },
        vehiclesWithWarnings: { type: 'number', example: 25 },
        totalDailyKwhConsumed: { type: 'number', example: 150000.5 },
        totalDailyKwhDelivered: { type: 'number', example: 127500.42 },
      },
    },
  })
  async getFleetOverview() {
    return this.statusService.getFleetOverview();
  }

  /**
   * Get current status of a specific meter
   */
  @Get('meter/:meterId')
  @ApiOperation({
    summary: 'Get meter current status',
    description: 'Returns the latest known status of a Smart Meter. O(1) lookup.',
  })
  @ApiParam({
    name: 'meterId',
    description: 'Smart Meter ID',
    example: 'METER-001-NYC',
  })
  @ApiResponse({
    status: 200,
    description: 'Meter current status',
  })
  @ApiResponse({
    status: 404,
    description: 'Meter not found',
  })
  async getMeterStatus(@Param('meterId') meterId: string) {
    return this.statusService.getMeterStatus(meterId);
  }

  /**
   * Get current status of a specific vehicle
   */
  @Get('vehicle/:vehicleId')
  @ApiOperation({
    summary: 'Get vehicle current status',
    description:
      'Returns the latest known status of a Vehicle including SoC, charging state, and battery temp. O(1) lookup.',
  })
  @ApiParam({
    name: 'vehicleId',
    description: 'Vehicle ID',
    example: 'VH-TESLA-001',
  })
  @ApiResponse({
    status: 200,
    description: 'Vehicle current status',
  })
  @ApiResponse({
    status: 404,
    description: 'Vehicle not found',
  })
  async getVehicleStatus(@Param('vehicleId') vehicleId: string) {
    return this.statusService.getVehicleStatus(vehicleId);
  }

  /**
   * Get all online meters
   */
  @Get('meters/online')
  @ApiOperation({
    summary: 'Get all online meters',
    description: 'Returns all meters that have reported within the last 5 minutes.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of online meters',
  })
  async getOnlineMeters() {
    return this.statusService.getOnlineMeters();
  }

  /**
   * Get all charging vehicles
   */
  @Get('vehicles/charging')
  @ApiOperation({
    summary: 'Get all charging vehicles',
    description: 'Returns all vehicles currently in charging state, ordered by lowest SoC first.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of charging vehicles',
  })
  async getChargingVehicles() {
    return this.statusService.getChargingVehicles();
  }

  /**
   * Get vehicles with battery temperature warnings
   */
  @Get('vehicles/warnings')
  @ApiOperation({
    summary: 'Get vehicles with warnings',
    description: 'Returns all vehicles with battery temperature warnings, ordered by highest temp first.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of vehicles with warnings',
  })
  async getVehiclesWithWarnings() {
    return this.statusService.getVehiclesWithTempWarnings();
  }

  /**
   * Get paginated list of all meters
   */
  @Get('meters')
  @ApiOperation({
    summary: 'Get all meters (paginated)',
    description: 'Returns paginated list of all meters in the system.',
  })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 50, max: 100)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of meters',
  })
  async getAllMeters(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.statusService.getAllMeters(
      page || 1,
      Math.min(limit || 50, 100),
    );
  }

  /**
   * Get paginated list of all vehicles
   */
  @Get('vehicles')
  @ApiOperation({
    summary: 'Get all vehicles (paginated)',
    description: 'Returns paginated list of all vehicles in the system.',
  })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 50, max: 100)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of vehicles',
  })
  async getAllVehicles(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.statusService.getAllVehicles(
      page || 1,
      Math.min(limit || 50, 100),
    );
  }
}
