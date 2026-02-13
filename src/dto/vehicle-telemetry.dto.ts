import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsDateString,
  Min,
  Max,
  IsNotEmpty,
} from 'class-validator';

/**
 * DTO for Vehicle telemetry data
 * Validates incoming vehicle heartbeat payloads
 */
export class VehicleTelemetryDto {
  @ApiProperty({
    description: 'Unique identifier for the Vehicle',
    example: 'VH-TESLA-001',
  })
  @IsString()
  @IsNotEmpty()
  vehicleId: string;

  @ApiProperty({
    description: 'State of Charge - Battery percentage (0-100)',
    example: 75.5,
    minimum: 0,
    maximum: 100,
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  soc: number;

  @ApiProperty({
    description: 'DC energy delivered to battery in kWh',
    example: 10.2345,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  kwhDeliveredDc: number;

  @ApiProperty({
    description: 'Battery temperature in Celsius',
    example: 35.2,
    minimum: -40,
    maximum: 100,
  })
  @IsNumber()
  @Min(-40)
  @Max(100)
  batteryTemp: number;

  @ApiProperty({
    description: 'Timestamp when the reading was taken (ISO 8601)',
    example: '2026-02-12T10:30:00.000Z',
  })
  @IsDateString()
  timestamp: string;
}
