import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThan } from 'typeorm';
import {
  MeterCurrentStatus,
  VehicleCurrentStatus,
} from '../../../entities';

// Device is considered offline if no reading in last 5 minutes
const OFFLINE_THRESHOLD_MS = 5 * 60 * 1000;

@Injectable()
export class StatusService {
  constructor(
    @InjectRepository(MeterCurrentStatus)
    private readonly meterStatusRepo: Repository<MeterCurrentStatus>,

    @InjectRepository(VehicleCurrentStatus)
    private readonly vehicleStatusRepo: Repository<VehicleCurrentStatus>,
  ) {}

  /**
   * Get current status of a specific meter
   * Fast O(1) lookup using primary key
   */
  async getMeterStatus(meterId: string): Promise<MeterCurrentStatus> {
    const status = await this.meterStatusRepo.findOne({
      where: { meterId },
    });

    if (!status) {
      throw new NotFoundException(`Meter ${meterId} not found`);
    }

    // Check if offline
    const now = new Date();
    if (now.getTime() - status.lastReadingAt.getTime() > OFFLINE_THRESHOLD_MS) {
      status.status = 'offline';
    }

    return status;
  }

  /**
   * Get current status of a specific vehicle
   * Fast O(1) lookup using primary key
   */
  async getVehicleStatus(vehicleId: string): Promise<VehicleCurrentStatus> {
    const status = await this.vehicleStatusRepo.findOne({
      where: { vehicleId },
    });

    if (!status) {
      throw new NotFoundException(`Vehicle ${vehicleId} not found`);
    }

    // Check if offline
    const now = new Date();
    if (now.getTime() - status.lastReadingAt.getTime() > OFFLINE_THRESHOLD_MS) {
      status.chargingState = 'offline';
    }

    return status;
  }

  /**
   * Get all meters with online status
   * Uses indexed status column for efficient filtering
   */
  async getOnlineMeters(): Promise<MeterCurrentStatus[]> {
    const threshold = new Date(Date.now() - OFFLINE_THRESHOLD_MS);
    return this.meterStatusRepo.find({
      where: {
        lastReadingAt: MoreThan(threshold),
      },
      order: {
        lastReadingAt: 'DESC',
      },
    });
  }

  /**
   * Get all vehicles currently charging
   * Uses indexed chargingState column
   */
  async getChargingVehicles(): Promise<VehicleCurrentStatus[]> {
    return this.vehicleStatusRepo.find({
      where: {
        chargingState: 'charging',
      },
      order: {
        soc: 'ASC', // Lowest SoC first (priority)
      },
    });
  }

  /**
   * Get vehicles with battery temperature warnings
   */
  async getVehiclesWithTempWarnings(): Promise<VehicleCurrentStatus[]> {
    return this.vehicleStatusRepo.find({
      where: {
        batteryTempWarning: true,
      },
      order: {
        batteryTemp: 'DESC',
      },
    });
  }

  /**
   * Get fleet overview statistics
   * Aggregates hot store data for dashboard
   */
  async getFleetOverview(): Promise<{
    totalMeters: number;
    onlineMeters: number;
    offlineMeters: number;
    totalVehicles: number;
    chargingVehicles: number;
    idleVehicles: number;
    vehiclesWithWarnings: number;
    totalDailyKwhConsumed: number;
    totalDailyKwhDelivered: number;
  }> {
    const threshold = new Date(Date.now() - OFFLINE_THRESHOLD_MS);

    // Meter statistics
    const [totalMeters, onlineMeters] = await Promise.all([
      this.meterStatusRepo.count(),
      this.meterStatusRepo.count({
        where: { lastReadingAt: MoreThan(threshold) },
      }),
    ]);

    // Vehicle statistics
    const [
      totalVehicles,
      chargingVehicles,
      vehiclesWithWarnings,
      energyStats,
    ] = await Promise.all([
      this.vehicleStatusRepo.count(),
      this.vehicleStatusRepo.count({ where: { chargingState: 'charging' } }),
      this.vehicleStatusRepo.count({ where: { batteryTempWarning: true } }),
      this.vehicleStatusRepo
        .createQueryBuilder('v')
        .select('SUM(v.dailyKwhDeliveredDc)', 'totalDc')
        .getRawOne(),
    ]);

    const meterEnergyStats = await this.meterStatusRepo
      .createQueryBuilder('m')
      .select('SUM(m.dailyKwhConsumedAc)', 'totalAc')
      .getRawOne();

    return {
      totalMeters,
      onlineMeters,
      offlineMeters: totalMeters - onlineMeters,
      totalVehicles,
      chargingVehicles,
      idleVehicles: totalVehicles - chargingVehicles,
      vehiclesWithWarnings,
      totalDailyKwhConsumed: parseFloat(meterEnergyStats?.totalAc || '0'),
      totalDailyKwhDelivered: parseFloat(energyStats?.totalDc || '0'),
    };
  }

  /**
   * Get paginated list of all meters
   */
  async getAllMeters(
    page: number = 1,
    limit: number = 50,
  ): Promise<{ data: MeterCurrentStatus[]; total: number; page: number; pages: number }> {
    const [data, total] = await this.meterStatusRepo.findAndCount({
      order: { lastReadingAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  /**
   * Get paginated list of all vehicles
   */
  async getAllVehicles(
    page: number = 1,
    limit: number = 50,
  ): Promise<{ data: VehicleCurrentStatus[]; total: number; page: number; pages: number }> {
    const [data, total] = await this.vehicleStatusRepo.findAndCount({
      order: { lastReadingAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }
}
