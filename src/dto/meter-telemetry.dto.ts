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
 * DTO for Smart Meter telemetry data
 * Validates incoming meter heartbeat payloads
 */
export class MeterTelemetryDto {
  @ApiProperty({
    description: 'Unique identifier for the Smart Meter',
    example: 'METER-001-NYC',
  })
  @IsString()
  @IsNotEmpty()
  meterId: string;

  @ApiProperty({
    description: 'AC energy consumed from grid in kWh',
    example: 12.5432,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  kwhConsumedAc: number;

  @ApiProperty({
    description: 'Grid voltage reading in Volts',
    example: 240.5,
    minimum: 0,
    maximum: 500,
  })
  @IsNumber()
  @Min(0)
  @Max(500)
  voltage: number;

  @ApiProperty({
    description: 'Timestamp when the reading was taken (ISO 8601)',
    example: '2026-02-12T10:30:00.000Z',
  })
  @IsDateString()
  timestamp: string;
}
