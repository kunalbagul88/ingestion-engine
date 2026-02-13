import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Device Mapping Table
 * 
 * Maps meters to vehicles for correlation analysis.
 * A Smart Meter can be associated with multiple vehicles (charging station)
 * but typically a vehicle charges from one meter at a time.
 */
@Entity('device_mapping')
@Index('idx_device_mapping_meter_vehicle', ['meterId', 'vehicleId'], { unique: true })
export class DeviceMapping {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  meterId: string;

  @PrimaryColumn({ type: 'varchar', length: 64 })
  vehicleId: string;

  /**
   * Whether this mapping is currently active
   */
  @Column({ type: 'boolean', default: true })
  @Index('idx_device_mapping_active')
  isActive: boolean;

  /**
   * When the mapping was established
   */
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  /**
   * When the mapping was last updated
   */
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
