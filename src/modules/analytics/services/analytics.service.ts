import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  VehicleTelemetryHistory,
  MeterTelemetryHistory,
  DeviceMapping,
} from '../../../entities';
import {
  PerformanceAnalyticsResponseDto,
  FleetEfficiencyDto,
} from '../../../dto';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly efficiencyWarningThreshold: number;
  private readonly efficiencyCriticalThreshold: number;

  constructor(
    @InjectRepository(VehicleTelemetryHistory)
    private readonly vehicleHistoryRepo: Repository<VehicleTelemetryHistory>,

    @InjectRepository(MeterTelemetryHistory)
    private readonly meterHistoryRepo: Repository<MeterTelemetryHistory>,

    @InjectRepository(DeviceMapping)
    private readonly deviceMappingRepo: Repository<DeviceMapping>,

    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {
    this.efficiencyWarningThreshold = this.configService.get<number>(
      'EFFICIENCY_WARNING_THRESHOLD',
      0.85,
    );
    this.efficiencyCriticalThreshold = this.configService.get<number>(
      'EFFICIENCY_CRITICAL_THRESHOLD',
      0.75,
    );
  }

  /**
   * Get 24-hour performance analytics for a specific vehicle
   * 
   * CRITICAL: Uses indexed queries to avoid full table scans:
   * - Uses composite index on (vehicleId, timestamp) for vehicle history
   * - Uses composite index on (meterId, timestamp) for meter history
   * - Leverages device mapping for correlation
   * 
   * Query plan uses Index Scan on idx_vehicle_history_vehicle_timestamp
   */
  async getPerformance(
    vehicleId: string,
    hours: number = 24,
    meterId?: string,
  ): Promise<PerformanceAnalyticsResponseDto> {
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - hours * 60 * 60 * 1000);

    // Find associated meter if not provided
    if (!meterId) {
      const mapping = await this.deviceMappingRepo.findOne({
        where: { vehicleId, isActive: true },
      });
      meterId = mapping?.meterId;
    }

    // Query vehicle telemetry with indexed access
    // Uses: idx_vehicle_history_vehicle_timestamp
    const vehicleStats = await this.dataSource.query<
      Array<{
        totalKwhDeliveredDc: string;
        avgBatteryTemp: string;
        maxBatteryTemp: string;
        minBatteryTemp: string;
        readingsCount: string;
      }>
    >(
      `
      SELECT 
        COALESCE(SUM("kwhDeliveredDc"), 0) as "totalKwhDeliveredDc",
        COALESCE(AVG("batteryTemp"), 0) as "avgBatteryTemp",
        COALESCE(MAX("batteryTemp"), 0) as "maxBatteryTemp",
        COALESCE(MIN("batteryTemp"), 0) as "minBatteryTemp",
        COUNT(*) as "readingsCount"
      FROM vehicle_telemetry_history
      WHERE "vehicleId" = $1
        AND timestamp >= $2
        AND timestamp <= $3
      `,
      [vehicleId, periodStart, periodEnd],
    );

    if (!vehicleStats[0] || parseInt(vehicleStats[0].readingsCount) === 0) {
      throw new NotFoundException(
        `No telemetry data found for vehicle ${vehicleId} in the last ${hours} hours`,
      );
    }

    // Query meter telemetry if correlation exists
    // Uses: idx_meter_history_meter_timestamp OR idx_meter_history_vehicle_id
    let totalKwhConsumedAc = 0;

    if (meterId) {
      const meterStats = await this.dataSource.query<
        Array<{ totalKwhConsumedAc: string }>
      >(
        `
        SELECT COALESCE(SUM("kwhConsumedAc"), 0) as "totalKwhConsumedAc"
        FROM meter_telemetry_history
        WHERE "meterId" = $1
          AND timestamp >= $2
          AND timestamp <= $3
        `,
        [meterId, periodStart, periodEnd],
      );
      totalKwhConsumedAc = parseFloat(meterStats[0]?.totalKwhConsumedAc || '0');
    } else {
      // Fallback: try to find meter data correlated by vehicle ID in history
      const meterStats = await this.dataSource.query<
        Array<{ totalKwhConsumedAc: string }>
      >(
        `
        SELECT COALESCE(SUM("kwhConsumedAc"), 0) as "totalKwhConsumedAc"
        FROM meter_telemetry_history
        WHERE "vehicleId" = $1
          AND timestamp >= $2
          AND timestamp <= $3
        `,
        [vehicleId, periodStart, periodEnd],
      );
      totalKwhConsumedAc = parseFloat(meterStats[0]?.totalKwhConsumedAc || '0');
    }

    const totalKwhDeliveredDc = parseFloat(vehicleStats[0].totalKwhDeliveredDc);
    const avgBatteryTemp = parseFloat(vehicleStats[0].avgBatteryTemp);
    const maxBatteryTemp = parseFloat(vehicleStats[0].maxBatteryTemp);
    const minBatteryTemp = parseFloat(vehicleStats[0].minBatteryTemp);
    const readingsCount = parseInt(vehicleStats[0].readingsCount);

    // Calculate efficiency ratio
    // DC/AC ratio - typically 0.85-0.95 for healthy systems
    let efficiencyRatio = 0;
    if (totalKwhConsumedAc > 0) {
      efficiencyRatio = totalKwhDeliveredDc / totalKwhConsumedAc;
    } else if (totalKwhDeliveredDc > 0) {
      // If no AC data, estimate AC as DC / 0.9 (typical efficiency)
      totalKwhConsumedAc = totalKwhDeliveredDc / 0.9;
      efficiencyRatio = 0.9;
    }

    // Determine efficiency status
    let efficiencyStatus: 'excellent' | 'good' | 'warning' | 'critical';
    let warning: string | undefined;

    if (efficiencyRatio >= 0.92) {
      efficiencyStatus = 'excellent';
    } else if (efficiencyRatio >= this.efficiencyWarningThreshold) {
      efficiencyStatus = 'good';
    } else if (efficiencyRatio >= this.efficiencyCriticalThreshold) {
      efficiencyStatus = 'warning';
      warning = `Efficiency below ${this.efficiencyWarningThreshold * 100}% - possible hardware inefficiency`;
    } else {
      efficiencyStatus = 'critical';
      warning = `Efficiency below ${this.efficiencyCriticalThreshold * 100}% - likely hardware fault or energy leakage detected`;
    }

    // Add battery temperature warning if applicable
    if (maxBatteryTemp > 55) {
      warning = (warning ? warning + '. ' : '') + 
        `Critical battery temperature recorded: ${maxBatteryTemp}°C`;
    } else if (maxBatteryTemp > 45) {
      warning = (warning ? warning + '. ' : '') + 
        `Elevated battery temperature recorded: ${maxBatteryTemp}°C`;
    }

    const response: PerformanceAnalyticsResponseDto = {
      vehicleId,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      totalKwhConsumedAc: Math.round(totalKwhConsumedAc * 10000) / 10000,
      totalKwhDeliveredDc: Math.round(totalKwhDeliveredDc * 10000) / 10000,
      efficiencyRatio: Math.round(efficiencyRatio * 10000) / 10000,
      efficiencyStatus,
      avgBatteryTemp: Math.round(avgBatteryTemp * 100) / 100,
      maxBatteryTemp: Math.round(maxBatteryTemp * 100) / 100,
      minBatteryTemp: Math.round(minBatteryTemp * 100) / 100,
      warning,
      readingsCount,
      meterId,
    };

    this.logger.debug(
      `Performance analytics for ${vehicleId}: Efficiency=${efficiencyRatio.toFixed(4)}, Status=${efficiencyStatus}`,
    );

    return response;
  }

  /**
   * Get fleet-wide efficiency summary
   * 
   * Uses aggregation on indexed columns for performance
   */
  async getFleetEfficiency(hours: number = 24): Promise<FleetEfficiencyDto> {
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - hours * 60 * 60 * 1000);

    // Get aggregated vehicle stats
    const vehicleStats = await this.dataSource.query<
      Array<{
        totalVehicles: string;
        totalKwhDeliveredDc: string;
      }>
    >(
      `
      SELECT 
        COUNT(DISTINCT "vehicleId") as "totalVehicles",
        COALESCE(SUM("kwhDeliveredDc"), 0) as "totalKwhDeliveredDc"
      FROM vehicle_telemetry_history
      WHERE timestamp >= $1
        AND timestamp <= $2
      `,
      [periodStart, periodEnd],
    );

    // Get aggregated meter stats
    const meterStats = await this.dataSource.query<
      Array<{ totalKwhConsumedAc: string }>
    >(
      `
      SELECT COALESCE(SUM("kwhConsumedAc"), 0) as "totalKwhConsumedAc"
      FROM meter_telemetry_history
      WHERE timestamp >= $1
        AND timestamp <= $2
      `,
      [periodStart, periodEnd],
    );

    // Get efficiency breakdown per vehicle
    const efficiencyBreakdown = await this.dataSource.query<
      Array<{
        vehicleId: string;
        totalDc: string;
        totalAc: string;
        ratio: string;
      }>
    >(
      `
      WITH vehicle_energy AS (
        SELECT 
          vh."vehicleId",
          SUM(vh."kwhDeliveredDc") as "totalDc",
          COALESCE(
            (SELECT SUM(mh."kwhConsumedAc") 
             FROM meter_telemetry_history mh 
             WHERE mh."vehicleId" = vh."vehicleId"
               AND mh.timestamp >= $1 
               AND mh.timestamp <= $2),
            0
          ) as "totalAc"
        FROM vehicle_telemetry_history vh
        WHERE vh.timestamp >= $1
          AND vh.timestamp <= $2
        GROUP BY vh."vehicleId"
      )
      SELECT 
        "vehicleId",
        "totalDc",
        "totalAc",
        CASE WHEN "totalAc" > 0 THEN "totalDc" / "totalAc" ELSE 0 END as ratio
      FROM vehicle_energy
      WHERE "totalAc" > 0
      `,
      [periodStart, periodEnd],
    );

    const totalVehicles = parseInt(vehicleStats[0]?.totalVehicles || '0');
    const totalKwhDeliveredDc = parseFloat(vehicleStats[0]?.totalKwhDeliveredDc || '0');
    const totalKwhConsumedAc = parseFloat(meterStats[0]?.totalKwhConsumedAc || '0');

    const avgEfficiencyRatio = totalKwhConsumedAc > 0 
      ? totalKwhDeliveredDc / totalKwhConsumedAc 
      : 0;

    const vehiclesWithWarnings = efficiencyBreakdown.filter(
      (v: { vehicleId: string; totalDc: string; totalAc: string; ratio: string }) => 
        parseFloat(v.ratio) < this.efficiencyWarningThreshold && parseFloat(v.ratio) >= this.efficiencyCriticalThreshold,
    ).length;

    const vehiclesCritical = efficiencyBreakdown.filter(
      (v: { vehicleId: string; totalDc: string; totalAc: string; ratio: string }) => 
        parseFloat(v.ratio) < this.efficiencyCriticalThreshold,
    ).length;

    return {
      totalVehicles,
      avgEfficiencyRatio: Math.round(avgEfficiencyRatio * 10000) / 10000,
      vehiclesWithWarnings,
      vehiclesCritical,
      totalKwhConsumedAc: Math.round(totalKwhConsumedAc * 100) / 100,
      totalKwhDeliveredDc: Math.round(totalKwhDeliveredDc * 100) / 100,
      totalEnergyLoss: Math.round((totalKwhConsumedAc - totalKwhDeliveredDc) * 100) / 100,
    };
  }

  /**
   * Get hourly efficiency trend for a vehicle
   * 
   * Uses indexed timestamp column for efficient window aggregation
   */
  async getEfficiencyTrend(
    vehicleId: string,
    hours: number = 24,
  ): Promise<
    Array<{
      hour: string;
      kwhConsumedAc: number;
      kwhDeliveredDc: number;
      efficiencyRatio: number;
      avgBatteryTemp: number;
    }>
  > {
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - hours * 60 * 60 * 1000);

    // Get associated meter
    const mapping = await this.deviceMappingRepo.findOne({
      where: { vehicleId, isActive: true },
    });

    const result = await this.dataSource.query(
      `
      WITH hourly_vehicle AS (
        SELECT 
          date_trunc('hour', timestamp) as hour,
          SUM("kwhDeliveredDc") as "kwhDeliveredDc",
          AVG("batteryTemp") as "avgBatteryTemp"
        FROM vehicle_telemetry_history
        WHERE "vehicleId" = $1
          AND timestamp >= $2
          AND timestamp <= $3
        GROUP BY date_trunc('hour', timestamp)
      ),
      hourly_meter AS (
        SELECT 
          date_trunc('hour', timestamp) as hour,
          SUM("kwhConsumedAc") as "kwhConsumedAc"
        FROM meter_telemetry_history
        WHERE ($4::varchar IS NULL OR "meterId" = $4 OR "vehicleId" = $1)
          AND timestamp >= $2
          AND timestamp <= $3
        GROUP BY date_trunc('hour', timestamp)
      )
      SELECT 
        hv.hour,
        COALESCE(hm."kwhConsumedAc", 0) as "kwhConsumedAc",
        hv."kwhDeliveredDc",
        CASE 
          WHEN hm."kwhConsumedAc" > 0 
          THEN hv."kwhDeliveredDc" / hm."kwhConsumedAc" 
          ELSE 0 
        END as "efficiencyRatio",
        hv."avgBatteryTemp"
      FROM hourly_vehicle hv
      LEFT JOIN hourly_meter hm ON hv.hour = hm.hour
      ORDER BY hv.hour
      `,
      [vehicleId, periodStart, periodEnd, mapping?.meterId || null],
    );

    return result.map((row: any) => ({
      hour: row.hour.toISOString(),
      kwhConsumedAc: Math.round(parseFloat(row.kwhConsumedAc) * 10000) / 10000,
      kwhDeliveredDc: Math.round(parseFloat(row.kwhDeliveredDc) * 10000) / 10000,
      efficiencyRatio: Math.round(parseFloat(row.efficiencyRatio) * 10000) / 10000,
      avgBatteryTemp: Math.round(parseFloat(row.avgBatteryTemp) * 100) / 100,
    }));
  }
}
