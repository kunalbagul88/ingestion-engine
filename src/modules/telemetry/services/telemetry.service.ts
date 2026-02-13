import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  MeterTelemetryHistory,
  VehicleTelemetryHistory,
  MeterCurrentStatus,
  VehicleCurrentStatus,
  DeviceMapping,
} from '../../../entities';
import {
  MeterTelemetryDto,
  VehicleTelemetryDto,
  PolymorphicTelemetryDto,
  TelemetryType,
} from '../../../dto';

// Battery temperature thresholds in Celsius
const BATTERY_TEMP_WARNING = 45;
const BATTERY_TEMP_CRITICAL = 55;

@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);

  constructor(
    @InjectRepository(MeterTelemetryHistory)
    private readonly meterHistoryRepo: Repository<MeterTelemetryHistory>,

    @InjectRepository(VehicleTelemetryHistory)
    private readonly vehicleHistoryRepo: Repository<VehicleTelemetryHistory>,

    @InjectRepository(MeterCurrentStatus)
    private readonly meterStatusRepo: Repository<MeterCurrentStatus>,

    @InjectRepository(VehicleCurrentStatus)
    private readonly vehicleStatusRepo: Repository<VehicleCurrentStatus>,

    @InjectRepository(DeviceMapping)
    private readonly deviceMappingRepo: Repository<DeviceMapping>,

    private readonly dataSource: DataSource,
  ) {}

  /**
   * Polymorphic ingestion - routes telemetry to appropriate handler
   */
  async ingestPolymorphic(dto: PolymorphicTelemetryDto): Promise<{ success: boolean; type: string; id: string }> {
    if (dto.type === TelemetryType.METER) {
      await this.ingestMeterTelemetry({
        meterId: dto.meterId!,
        kwhConsumedAc: dto.kwhConsumedAc!,
        voltage: dto.voltage!,
        timestamp: dto.timestamp,
      });
      return { success: true, type: 'meter', id: dto.meterId! };
    } else {
      await this.ingestVehicleTelemetry({
        vehicleId: dto.vehicleId!,
        soc: dto.soc!,
        kwhDeliveredDc: dto.kwhDeliveredDc!,
        batteryTemp: dto.batteryTemp!,
        timestamp: dto.timestamp,
      });
      return { success: true, type: 'vehicle', id: dto.vehicleId! };
    }
  }

  /**
   * Batch ingestion for high-throughput scenarios
   * Uses transactions for atomicity
   */
  async ingestBatch(readings: PolymorphicTelemetryDto[]): Promise<{
    success: number;
    failed: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let success = 0;
    let failed = 0;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const reading of readings) {
        try {
          await this.ingestPolymorphic(reading);
          success++;
        } catch (error) {
          failed++;
          errors.push(`${reading.type}:${reading.meterId || reading.vehicleId}: ${error.message}`);
        }
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Batch ingestion failed, rolling back', error);
      throw error;
    } finally {
      await queryRunner.release();
    }

    return { success, failed, errors };
  }

  /**
   * Ingest meter telemetry data
   * 
   * Dual-write strategy:
   * 1. INSERT into history (cold store) - append-only for audit trail
   * 2. UPSERT into current status (hot store) - always latest reading
   */
  async ingestMeterTelemetry(dto: MeterTelemetryDto): Promise<void> {
    const timestamp = new Date(dto.timestamp);
    
    // Find associated vehicle (if any)
    const mapping = await this.deviceMappingRepo.findOne({
      where: { meterId: dto.meterId, isActive: true },
    });

    // === COLD STORE: Append to history ===
    const historyEntry = this.meterHistoryRepo.create({
      meterId: dto.meterId,
      kwhConsumedAc: dto.kwhConsumedAc,
      voltage: dto.voltage,
      timestamp: timestamp,
      vehicleId: mapping?.vehicleId || null,
    });

    await this.meterHistoryRepo.insert(historyEntry);

    // === HOT STORE: Upsert current status ===
    await this.upsertMeterStatus(dto, timestamp, mapping?.vehicleId ?? null);

    this.logger.debug(`Ingested meter telemetry: ${dto.meterId} @ ${timestamp.toISOString()}`);
  }

  /**
   * Upsert meter current status using atomic ON CONFLICT
   */
  private async upsertMeterStatus(
    dto: MeterTelemetryDto,
    timestamp: Date,
    vehicleId: string | null,
  ): Promise<void> {
    // Use raw query for efficient UPSERT with increment logic
    await this.dataSource.query(
      `
      INSERT INTO meter_current_status (
        "meterId", "kwhConsumedAc", "voltage", "lastReadingAt", 
        "dailyKwhConsumedAc", "vehicleId", "status", "createdAt", "updatedAt"
      )
      VALUES ($1, $2, $3, $4, $2, $5, 'online', NOW(), NOW())
      ON CONFLICT ("meterId") 
      DO UPDATE SET
        "kwhConsumedAc" = $2,
        "voltage" = $3,
        "lastReadingAt" = $4,
        "dailyKwhConsumedAc" = meter_current_status."dailyKwhConsumedAc" + 
          CASE 
            WHEN DATE($4) > DATE(meter_current_status."lastReadingAt") THEN $2
            ELSE ($2 - COALESCE(
              (SELECT "kwhConsumedAc" FROM meter_telemetry_history 
               WHERE "meterId" = $1 
               ORDER BY timestamp DESC LIMIT 1 OFFSET 1), $2
            ))
          END,
        "vehicleId" = COALESCE($5, meter_current_status."vehicleId"),
        "status" = 'online',
        "updatedAt" = NOW()
      `,
      [dto.meterId, dto.kwhConsumedAc, dto.voltage, timestamp, vehicleId],
    );
  }

  /**
   * Ingest vehicle telemetry data
   * 
   * Dual-write strategy:
   * 1. INSERT into history (cold store) - append-only for audit trail
   * 2. UPSERT into current status (hot store) - always latest reading
   */
  async ingestVehicleTelemetry(dto: VehicleTelemetryDto): Promise<void> {
    const timestamp = new Date(dto.timestamp);

    // Find associated meter (if any)
    const mapping = await this.deviceMappingRepo.findOne({
      where: { vehicleId: dto.vehicleId, isActive: true },
    });

    // === COLD STORE: Append to history ===
    const historyEntry = this.vehicleHistoryRepo.create({
      vehicleId: dto.vehicleId,
      soc: dto.soc,
      kwhDeliveredDc: dto.kwhDeliveredDc,
      batteryTemp: dto.batteryTemp,
      timestamp: timestamp,
      meterId: mapping?.meterId || null,
    });

    await this.vehicleHistoryRepo.insert(historyEntry);

    // === HOT STORE: Upsert current status ===
    await this.upsertVehicleStatus(dto, timestamp, mapping?.meterId ?? null);

    this.logger.debug(`Ingested vehicle telemetry: ${dto.vehicleId} @ ${timestamp.toISOString()}`);
  }

  /**
   * Upsert vehicle current status using atomic ON CONFLICT
   */
  private async upsertVehicleStatus(
    dto: VehicleTelemetryDto,
    timestamp: Date,
    meterId: string | null,
  ): Promise<void> {
    // Determine charging state based on SoC changes and energy delivery
    const chargingState = dto.kwhDeliveredDc > 0 ? 'charging' : 'idle';
    const batteryTempWarning = dto.batteryTemp >= BATTERY_TEMP_WARNING;

    await this.dataSource.query(
      `
      INSERT INTO vehicle_current_status (
        "vehicleId", "soc", "kwhDeliveredDc", "batteryTemp", "lastReadingAt",
        "dailyKwhDeliveredDc", "meterId", "chargingState", "batteryTempWarning",
        "createdAt", "updatedAt"
      )
      VALUES ($1, $2, $3, $4, $5, $3, $6, $7, $8, NOW(), NOW())
      ON CONFLICT ("vehicleId")
      DO UPDATE SET
        "soc" = $2,
        "kwhDeliveredDc" = $3,
        "batteryTemp" = $4,
        "lastReadingAt" = $5,
        "dailyKwhDeliveredDc" = vehicle_current_status."dailyKwhDeliveredDc" +
          CASE
            WHEN DATE($5) > DATE(vehicle_current_status."lastReadingAt") THEN $3
            ELSE GREATEST(0, $3 - COALESCE(vehicle_current_status."kwhDeliveredDc", 0))
          END,
        "meterId" = COALESCE($6, vehicle_current_status."meterId"),
        "chargingState" = $7,
        "batteryTempWarning" = $8,
        "updatedAt" = NOW()
      `,
      [dto.vehicleId, dto.soc, dto.kwhDeliveredDc, dto.batteryTemp, timestamp, meterId, chargingState, batteryTempWarning],
    );
  }

  /**
   * Create or update device mapping (meter <-> vehicle correlation)
   */
  async setDeviceMapping(meterId: string, vehicleId: string): Promise<void> {
    await this.deviceMappingRepo.upsert(
      {
        meterId,
        vehicleId,
        isActive: true,
      },
      ['meterId', 'vehicleId'],
    );

    // Update current status tables with the mapping
    await this.meterStatusRepo.update({ meterId }, { vehicleId });
    await this.vehicleStatusRepo.update({ vehicleId }, { meterId });

    this.logger.log(`Device mapping created: ${meterId} <-> ${vehicleId}`);
  }

  /**
   * Deactivate device mapping
   */
  async deactivateMapping(meterId: string, vehicleId: string): Promise<void> {
    await this.deviceMappingRepo.update(
      { meterId, vehicleId },
      { isActive: false },
    );

    this.logger.log(`Device mapping deactivated: ${meterId} <-> ${vehicleId}`);
  }
}
