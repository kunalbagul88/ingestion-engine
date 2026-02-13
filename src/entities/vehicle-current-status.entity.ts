import {
  Entity,
  Column,
  PrimaryColumn,
  UpdateDateColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Operational (Hot) Store for Vehicle Current Status
 * 
 * Design Decisions:
 * - UPSERT pattern - only keeps latest reading per vehicle
 * - Primary key on vehicleId ensures uniqueness
 * - Dashboard queries hit this table instead of scanning history
 * - Small table size (~10,000 rows) enables fast reads
 */
@Entity('vehicle_current_status')
export class VehicleCurrentStatus {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  vehicleId: string;

  /**
   * Latest State of Charge (Battery percentage: 0-100)
   */
  @Column({ type: 'decimal', precision: 5, scale: 2 })
  soc: number;

  /**
   * Latest DC energy delivered to battery (kWh)
   */
  @Column({ type: 'decimal', precision: 12, scale: 4 })
  kwhDeliveredDc: number;

  /**
   * Latest battery temperature (Celsius)
   */
  @Column({ type: 'decimal', precision: 5, scale: 2 })
  batteryTemp: number;

  /**
   * Device-reported timestamp of latest reading
   */
  @Column({ type: 'timestamptz' })
  @Index('idx_vehicle_current_timestamp')
  lastReadingAt: Date;

  /**
   * Cumulative energy delivered today (resets at midnight)
   */
  @Column({ type: 'decimal', precision: 14, scale: 4, default: 0 })
  dailyKwhDeliveredDc: number;

  /**
   * Associated meter ID (for correlation)
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  @Index('idx_vehicle_current_meter_id')
  meterId: string | null;

  /**
   * Charging state for quick filtering
   */
  @Column({
    type: 'enum',
    enum: ['charging', 'idle', 'discharging', 'offline', 'error'],
    default: 'idle',
  })
  @Index('idx_vehicle_current_charging_state')
  chargingState: 'charging' | 'idle' | 'discharging' | 'offline' | 'error';

  /**
   * Flag indicating if battery temp is above safe threshold
   */
  @Column({ type: 'boolean', default: false })
  batteryTempWarning: boolean;

  /**
   * When this record was first created
   */
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  /**
   * When this record was last updated
   */
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
