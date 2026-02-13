import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
  CreateDateColumn,
} from 'typeorm';

/**
 * Historical (Cold) Store for Vehicle Telemetry
 * 
 * Design Decisions:
 * - Append-only table (INSERT only) for audit trail
 * - Composite index on (vehicleId, timestamp) for time-range queries
 * - Partitioning-ready structure for billions of rows
 * - No updates allowed - preserves data integrity for analytics
 */
@Entity('vehicle_telemetry_history')
@Index('idx_vehicle_history_vehicle_timestamp', ['vehicleId', 'timestamp'])
@Index('idx_vehicle_history_timestamp', ['timestamp'])
export class VehicleTelemetryHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  @Index('idx_vehicle_history_vehicle_id')
  vehicleId: string;

  /**
   * State of Charge (Battery percentage: 0-100)
   */
  @Column({ type: 'decimal', precision: 5, scale: 2 })
  soc: number;

  /**
   * DC energy delivered to battery (kWh)
   * This is the actual energy stored in the vehicle
   */
  @Column({ type: 'decimal', precision: 12, scale: 4 })
  kwhDeliveredDc: number;

  /**
   * Battery temperature (Celsius)
   * High temps indicate potential issues
   */
  @Column({ type: 'decimal', precision: 5, scale: 2 })
  batteryTemp: number;

  /**
   * Device-reported timestamp (when reading was taken)
   */
  @Column({ type: 'timestamptz' })
  timestamp: Date;

  /**
   * Server-side ingestion timestamp
   * Used for debugging latency issues
   */
  @CreateDateColumn({ type: 'timestamptz' })
  ingestedAt: Date;

  /**
   * Associated meter ID (for correlation with meter telemetry)
   * Nullable because vehicle-meter mapping may not always be known
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  @Index('idx_vehicle_history_meter_id')
  meterId: string | null;
}
