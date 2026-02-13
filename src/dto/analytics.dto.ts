import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Response DTO for 24-hour performance analytics
 */
export class PerformanceAnalyticsResponseDto {
  @ApiProperty({
    description: 'Vehicle identifier',
    example: 'VH-TESLA-001',
  })
  vehicleId: string;

  @ApiProperty({
    description: 'Start of the analysis period (ISO 8601)',
    example: '2026-02-11T10:30:00.000Z',
  })
  periodStart: string;

  @ApiProperty({
    description: 'End of the analysis period (ISO 8601)',
    example: '2026-02-12T10:30:00.000Z',
  })
  periodEnd: string;

  @ApiProperty({
    description: 'Total AC energy consumed from grid in kWh',
    example: 150.5432,
  })
  totalKwhConsumedAc: number;

  @ApiProperty({
    description: 'Total DC energy delivered to battery in kWh',
    example: 127.9617,
  })
  totalKwhDeliveredDc: number;

  @ApiProperty({
    description: 'Efficiency ratio (DC/AC) - typically 0.85-0.95 for healthy systems',
    example: 0.85,
  })
  efficiencyRatio: number;

  @ApiProperty({
    description: 'Efficiency status based on ratio',
    enum: ['excellent', 'good', 'warning', 'critical'],
    example: 'good',
  })
  efficiencyStatus: 'excellent' | 'good' | 'warning' | 'critical';

  @ApiProperty({
    description: 'Average battery temperature in Celsius over the period',
    example: 32.5,
  })
  avgBatteryTemp: number;

  @ApiProperty({
    description: 'Maximum battery temperature recorded in the period',
    example: 45.2,
  })
  maxBatteryTemp: number;

  @ApiProperty({
    description: 'Minimum battery temperature recorded in the period',
    example: 22.1,
  })
  minBatteryTemp: number;

  @ApiPropertyOptional({
    description: 'Warning message if efficiency is below threshold',
    example: 'Efficiency below 85% - possible hardware fault or energy leakage',
  })
  warning?: string;

  @ApiProperty({
    description: 'Number of telemetry readings analyzed',
    example: 1440,
  })
  readingsCount: number;

  @ApiProperty({
    description: 'Associated meter ID (if available)',
    example: 'METER-001-NYC',
  })
  meterId?: string;
}

/**
 * Query parameters for analytics
 */
export class AnalyticsQueryDto {
  @ApiPropertyOptional({
    description: 'Number of hours to analyze (default: 24)',
    example: 24,
    default: 24,
  })
  hours?: number = 24;

  @ApiPropertyOptional({
    description: 'Associated meter ID for correlation',
    example: 'METER-001-NYC',
  })
  meterId?: string;
}

/**
 * Fleet-wide efficiency summary
 */
export class FleetEfficiencyDto {
  @ApiProperty({
    description: 'Total vehicles analyzed',
    example: 10000,
  })
  totalVehicles: number;

  @ApiProperty({
    description: 'Average fleet efficiency ratio',
    example: 0.87,
  })
  avgEfficiencyRatio: number;

  @ApiProperty({
    description: 'Vehicles with efficiency warnings (below 85%)',
    example: 150,
  })
  vehiclesWithWarnings: number;

  @ApiProperty({
    description: 'Vehicles with critical efficiency (below 75%)',
    example: 25,
  })
  vehiclesCritical: number;

  @ApiProperty({
    description: 'Total energy consumed (AC) in kWh',
    example: 1500000.25,
  })
  totalKwhConsumedAc: number;

  @ApiProperty({
    description: 'Total energy delivered (DC) in kWh',
    example: 1275000.21,
  })
  totalKwhDeliveredDc: number;

  @ApiProperty({
    description: 'Total energy lost in conversion in kWh',
    example: 225000.04,
  })
  totalEnergyLoss: number;
}
