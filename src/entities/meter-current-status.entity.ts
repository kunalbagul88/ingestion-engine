import {
  Entity,
  Column,
  PrimaryColumn,
  UpdateDateColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Operational (Hot) Store for Meter Current Status
 * 
 * Design Decisions:
 * - UPSERT pattern - only keeps latest reading per meter
 * - Primary key on meterId ensures uniqueness
 * - Dashboard queries hit this table instead of scanning history
 * - Small table size (~10,000 rows) enables fast reads
 */
@Entity('meter_current_status')
export class MeterCurrentStatus {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  meterId: string;

  /**
   * Latest AC energy consumed from grid (kWh)
   */
  @Column({ type: 'decimal', precision: 12, scale: 4 })
  kwhConsumedAc: number;

  /**
   * Latest grid voltage reading (Volts)
   */
  @Column({ type: 'decimal', precision: 8, scale: 2 })
  voltage: number;

  /**
   * Device-reported timestamp of latest reading
   */
  @Column({ type: 'timestamptz' })
  @Index('idx_meter_current_timestamp')
  lastReadingAt: Date;

  /**
   * Cumulative energy consumed today (resets at midnight)
   * Used for daily billing summaries
   */
  @Column({ type: 'decimal', precision: 14, scale: 4, default: 0 })
  dailyKwhConsumedAc: number;

  /**
   * Associated vehicle ID (for correlation)
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  @Index('idx_meter_current_vehicle_id')
  vehicleId: string | null;

  /**
   * Meter status for quick filtering
   */
  @Column({
    type: 'enum',
    enum: ['online', 'offline', 'error'],
    default: 'online',
  })
  @Index('idx_meter_current_status')
  status: 'online' | 'offline' | 'error';

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
