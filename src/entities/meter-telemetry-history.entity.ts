import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
  CreateDateColumn,
} from 'typeorm';

/**
 * Historical (Cold) Store for Meter Telemetry
 * 
 * Design Decisions:
 * - Append-only table (INSERT only) for audit trail
 * - Composite index on (meterId, timestamp) for time-range queries
 * - Partitioning-ready structure for billions of rows
 * - No updates allowed - preserves data integrity for billing audits
 */
@Entity('meter_telemetry_history')
@Index('idx_meter_history_meter_timestamp', ['meterId', 'timestamp'])
@Index('idx_meter_history_timestamp', ['timestamp'])
export class MeterTelemetryHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  @Index('idx_meter_history_meter_id')
  meterId: string;

  /**
   * AC energy consumed from grid (kWh)
   * This is what the fleet owner is billed for
   */
  @Column({ type: 'decimal', precision: 12, scale: 4 })
  kwhConsumedAc: number;

  /**
   * Grid voltage reading (Volts)
   * Used for power quality monitoring
   */
  @Column({ type: 'decimal', precision: 8, scale: 2 })
  voltage: number;

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
   * Associated vehicle ID (for correlation with vehicle telemetry)
   * Nullable because meter-vehicle mapping may not always be known
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  @Index('idx_meter_history_vehicle_id')
  vehicleId: string | null;
}
