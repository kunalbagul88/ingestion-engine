import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsDateString,
  IsEnum,
  IsOptional,
  Min,
  Max,
  IsNotEmpty,
  ValidateIf,
} from 'class-validator';

/**
 * Telemetry stream types
 */
export enum TelemetryType {
  METER = 'meter',
  VEHICLE = 'vehicle',
}

/**
 * Polymorphic DTO for unified telemetry ingestion
 * 
 * This DTO allows a single endpoint to accept both meter and vehicle
 * telemetry, using conditional validation based on the type field.
 */
export class PolymorphicTelemetryDto {
  @ApiProperty({
    enum: TelemetryType,
    description: 'Type of telemetry stream',
    example: TelemetryType.METER,
  })
  @IsEnum(TelemetryType)
  type: TelemetryType;

  // ============ METER FIELDS ============

  @ApiProperty({
    description: 'Unique identifier for the Smart Meter (required for meter type)',
    example: 'METER-001-NYC',
    required: false,
  })
  @ValidateIf((o: PolymorphicTelemetryDto) => o.type === TelemetryType.METER)
  @IsString()
  @IsNotEmpty()
  meterId?: string;

  @ApiProperty({
    description: 'AC energy consumed from grid in kWh (required for meter type)',
    example: 12.5432,
    required: false,
  })
  @ValidateIf((o: PolymorphicTelemetryDto) => o.type === TelemetryType.METER)
  @IsNumber()
  @Min(0)
  kwhConsumedAc?: number;

  @ApiProperty({
    description: 'Grid voltage reading in Volts (required for meter type)',
    example: 240.5,
    required: false,
  })
  @ValidateIf((o: PolymorphicTelemetryDto) => o.type === TelemetryType.METER)
  @IsNumber()
  @Min(0)
  @Max(500)
  voltage?: number;

  // ============ VEHICLE FIELDS ============

  @ApiProperty({
    description: 'Unique identifier for the Vehicle (required for vehicle type)',
    example: 'VH-TESLA-001',
    required: false,
  })
  @ValidateIf((o: PolymorphicTelemetryDto) => o.type === TelemetryType.VEHICLE)
  @IsString()
  @IsNotEmpty()
  vehicleId?: string;

  @ApiProperty({
    description: 'State of Charge - Battery percentage (required for vehicle type)',
    example: 75.5,
    required: false,
  })
  @ValidateIf((o: PolymorphicTelemetryDto) => o.type === TelemetryType.VEHICLE)
  @IsNumber()
  @Min(0)
  @Max(100)
  soc?: number;

  @ApiProperty({
    description: 'DC energy delivered to battery in kWh (required for vehicle type)',
    example: 10.2345,
    required: false,
  })
  @ValidateIf((o: PolymorphicTelemetryDto) => o.type === TelemetryType.VEHICLE)
  @IsNumber()
  @Min(0)
  kwhDeliveredDc?: number;

  @ApiProperty({
    description: 'Battery temperature in Celsius (required for vehicle type)',
    example: 35.2,
    required: false,
  })
  @ValidateIf((o: PolymorphicTelemetryDto) => o.type === TelemetryType.VEHICLE)
  @IsNumber()
  @Min(-40)
  @Max(100)
  batteryTemp?: number;

  // ============ COMMON FIELDS ============

  @ApiProperty({
    description: 'Timestamp when the reading was taken (ISO 8601)',
    example: '2026-02-12T10:30:00.000Z',
  })
  @IsDateString()
  timestamp: string;
}

/**
 * Batch ingestion DTO for high-throughput scenarios
 */
export class BatchTelemetryDto {
  @ApiProperty({
    type: [PolymorphicTelemetryDto],
    description: 'Array of telemetry readings to ingest',
  })
  readings: PolymorphicTelemetryDto[];
}
