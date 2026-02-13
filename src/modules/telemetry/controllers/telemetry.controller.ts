import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Put,
  Param,
  Delete,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { TelemetryService } from '../services/telemetry.service';
import {
  MeterTelemetryDto,
  VehicleTelemetryDto,
  PolymorphicTelemetryDto,
  BatchTelemetryDto,
} from '../../../dto';

@ApiTags('telemetry')
@Controller('v1/telemetry')
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  /**
   * Polymorphic ingestion endpoint
   * Accepts both meter and vehicle telemetry based on 'type' field
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Ingest telemetry data (polymorphic)',
    description:
      'Accepts both meter and vehicle telemetry. Use type="meter" or type="vehicle" to specify the stream type.',
  })
  @ApiBody({ type: PolymorphicTelemetryDto })
  @ApiResponse({
    status: 201,
    description: 'Telemetry successfully ingested',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        type: { type: 'string', example: 'meter' },
        id: { type: 'string', example: 'METER-001-NYC' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async ingestPolymorphic(@Body() dto: PolymorphicTelemetryDto) {
    return this.telemetryService.ingestPolymorphic(dto);
  }

  /**
   * Batch ingestion for high-throughput scenarios
   */
  @Post('batch')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Batch ingest telemetry data',
    description:
      'Ingest multiple telemetry readings in a single request. Useful for buffer flush or historical data import.',
  })
  @ApiBody({ type: BatchTelemetryDto })
  @ApiResponse({
    status: 201,
    description: 'Batch ingestion completed',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'number', example: 100 },
        failed: { type: 'number', example: 2 },
        errors: {
          type: 'array',
          items: { type: 'string' },
          example: ['meter:METER-001: Invalid voltage'],
        },
      },
    },
  })
  async ingestBatch(@Body() dto: BatchTelemetryDto) {
    return this.telemetryService.ingestBatch(dto.readings);
  }

  /**
   * Dedicated endpoint for meter telemetry
   */
  @Post('meter')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Ingest Smart Meter telemetry',
    description: 'Dedicated endpoint for Smart Meter heartbeat data',
  })
  @ApiBody({ type: MeterTelemetryDto })
  @ApiResponse({
    status: 201,
    description: 'Meter telemetry successfully ingested',
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async ingestMeter(@Body() dto: MeterTelemetryDto) {
    await this.telemetryService.ingestMeterTelemetry(dto);
    return { success: true, type: 'meter', id: dto.meterId };
  }

  /**
   * Dedicated endpoint for vehicle telemetry
   */
  @Post('vehicle')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Ingest Vehicle telemetry',
    description: 'Dedicated endpoint for Vehicle/EV heartbeat data',
  })
  @ApiBody({ type: VehicleTelemetryDto })
  @ApiResponse({
    status: 201,
    description: 'Vehicle telemetry successfully ingested',
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async ingestVehicle(@Body() dto: VehicleTelemetryDto) {
    await this.telemetryService.ingestVehicleTelemetry(dto);
    return { success: true, type: 'vehicle', id: dto.vehicleId };
  }

  /**
   * Create device mapping (meter <-> vehicle correlation)
   */
  @Put('mapping/:meterId/:vehicleId')
  @ApiOperation({
    summary: 'Create device mapping',
    description: 'Associate a Smart Meter with a Vehicle for correlation analytics',
  })
  @ApiParam({ name: 'meterId', description: 'Smart Meter ID', example: 'METER-001-NYC' })
  @ApiParam({ name: 'vehicleId', description: 'Vehicle ID', example: 'VH-TESLA-001' })
  @ApiResponse({
    status: 200,
    description: 'Mapping created successfully',
  })
  async createMapping(
    @Param('meterId') meterId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    await this.telemetryService.setDeviceMapping(meterId, vehicleId);
    return { success: true, meterId, vehicleId };
  }

  /**
   * Deactivate device mapping
   */
  @Delete('mapping/:meterId/:vehicleId')
  @ApiOperation({
    summary: 'Deactivate device mapping',
    description: 'Remove association between a Smart Meter and a Vehicle',
  })
  @ApiParam({ name: 'meterId', description: 'Smart Meter ID', example: 'METER-001-NYC' })
  @ApiParam({ name: 'vehicleId', description: 'Vehicle ID', example: 'VH-TESLA-001' })
  @ApiResponse({
    status: 200,
    description: 'Mapping deactivated successfully',
  })
  async deactivateMapping(
    @Param('meterId') meterId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    await this.telemetryService.deactivateMapping(meterId, vehicleId);
    return { success: true, meterId, vehicleId };
  }
}
