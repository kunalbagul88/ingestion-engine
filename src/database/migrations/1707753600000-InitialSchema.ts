import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial database schema migration
 * 
 * Creates the following tables:
 * - meter_telemetry_history (Cold Store - append-only)
 * - vehicle_telemetry_history (Cold Store - append-only)
 * - meter_current_status (Hot Store - UPSERT)
 * - vehicle_current_status (Hot Store - UPSERT)
 * - device_mapping (Correlation table)
 * 
 * Includes optimized indexes for:
 * - Time-range queries (avoiding full table scans)
 * - Device lookups
 * - Status filtering
 */
export class InitialSchema1707753600000 implements MigrationInterface {
  name = 'InitialSchema1707753600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum type for meter status
    await queryRunner.query(`
      CREATE TYPE "public"."meter_status_enum" AS ENUM('online', 'offline', 'error')
    `);

    // Create enum type for vehicle charging state
    await queryRunner.query(`
      CREATE TYPE "public"."vehicle_charging_state_enum" AS ENUM('charging', 'idle', 'discharging', 'offline', 'error')
    `);

    // ============================================================
    // COLD STORE: Meter Telemetry History
    // Append-only table for audit trail and historical analytics
    // ============================================================
    await queryRunner.query(`
      CREATE TABLE "meter_telemetry_history" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "meterId" varchar(64) NOT NULL,
        "kwhConsumedAc" decimal(12,4) NOT NULL,
        "voltage" decimal(8,2) NOT NULL,
        "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL,
        "ingestedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "vehicleId" varchar(64),
        CONSTRAINT "PK_meter_telemetry_history" PRIMARY KEY ("id")
      )
    `);

    // Composite index for efficient time-range queries per meter
    // This is CRITICAL for avoiding full table scans in analytics
    await queryRunner.query(`
      CREATE INDEX "idx_meter_history_meter_timestamp" 
      ON "meter_telemetry_history" ("meterId", "timestamp")
    `);

    // Index for timestamp-only queries (fleet-wide aggregations)
    await queryRunner.query(`
      CREATE INDEX "idx_meter_history_timestamp" 
      ON "meter_telemetry_history" ("timestamp")
    `);

    // Index for meter ID lookups
    await queryRunner.query(`
      CREATE INDEX "idx_meter_history_meter_id" 
      ON "meter_telemetry_history" ("meterId")
    `);

    // Index for vehicle correlation queries
    await queryRunner.query(`
      CREATE INDEX "idx_meter_history_vehicle_id" 
      ON "meter_telemetry_history" ("vehicleId")
    `);

    // ============================================================
    // COLD STORE: Vehicle Telemetry History
    // Append-only table for audit trail and historical analytics
    // ============================================================
    await queryRunner.query(`
      CREATE TABLE "vehicle_telemetry_history" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "vehicleId" varchar(64) NOT NULL,
        "soc" decimal(5,2) NOT NULL,
        "kwhDeliveredDc" decimal(12,4) NOT NULL,
        "batteryTemp" decimal(5,2) NOT NULL,
        "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL,
        "ingestedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "meterId" varchar(64),
        CONSTRAINT "PK_vehicle_telemetry_history" PRIMARY KEY ("id")
      )
    `);

    // Composite index for efficient time-range queries per vehicle
    // This is CRITICAL for avoiding full table scans in analytics
    await queryRunner.query(`
      CREATE INDEX "idx_vehicle_history_vehicle_timestamp" 
      ON "vehicle_telemetry_history" ("vehicleId", "timestamp")
    `);

    // Index for timestamp-only queries (fleet-wide aggregations)
    await queryRunner.query(`
      CREATE INDEX "idx_vehicle_history_timestamp" 
      ON "vehicle_telemetry_history" ("timestamp")
    `);

    // Index for vehicle ID lookups
    await queryRunner.query(`
      CREATE INDEX "idx_vehicle_history_vehicle_id" 
      ON "vehicle_telemetry_history" ("vehicleId")
    `);

    // Index for meter correlation queries
    await queryRunner.query(`
      CREATE INDEX "idx_vehicle_history_meter_id" 
      ON "vehicle_telemetry_history" ("meterId")
    `);

    // ============================================================
    // HOT STORE: Meter Current Status
    // UPSERT table for fast dashboard queries
    // ============================================================
    await queryRunner.query(`
      CREATE TABLE "meter_current_status" (
        "meterId" varchar(64) NOT NULL,
        "kwhConsumedAc" decimal(12,4) NOT NULL,
        "voltage" decimal(8,2) NOT NULL,
        "lastReadingAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "dailyKwhConsumedAc" decimal(14,4) NOT NULL DEFAULT 0,
        "vehicleId" varchar(64),
        "status" "public"."meter_status_enum" NOT NULL DEFAULT 'online',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_meter_current_status" PRIMARY KEY ("meterId")
      )
    `);

    // Index for timestamp-based queries (finding stale meters)
    await queryRunner.query(`
      CREATE INDEX "idx_meter_current_timestamp" 
      ON "meter_current_status" ("lastReadingAt")
    `);

    // Index for vehicle correlation
    await queryRunner.query(`
      CREATE INDEX "idx_meter_current_vehicle_id" 
      ON "meter_current_status" ("vehicleId")
    `);

    // Index for status filtering
    await queryRunner.query(`
      CREATE INDEX "idx_meter_current_status" 
      ON "meter_current_status" ("status")
    `);

    // ============================================================
    // HOT STORE: Vehicle Current Status
    // UPSERT table for fast dashboard queries
    // ============================================================
    await queryRunner.query(`
      CREATE TABLE "vehicle_current_status" (
        "vehicleId" varchar(64) NOT NULL,
        "soc" decimal(5,2) NOT NULL,
        "kwhDeliveredDc" decimal(12,4) NOT NULL,
        "batteryTemp" decimal(5,2) NOT NULL,
        "lastReadingAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "dailyKwhDeliveredDc" decimal(14,4) NOT NULL DEFAULT 0,
        "meterId" varchar(64),
        "chargingState" "public"."vehicle_charging_state_enum" NOT NULL DEFAULT 'idle',
        "batteryTempWarning" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_vehicle_current_status" PRIMARY KEY ("vehicleId")
      )
    `);

    // Index for timestamp-based queries
    await queryRunner.query(`
      CREATE INDEX "idx_vehicle_current_timestamp" 
      ON "vehicle_current_status" ("lastReadingAt")
    `);

    // Index for meter correlation
    await queryRunner.query(`
      CREATE INDEX "idx_vehicle_current_meter_id" 
      ON "vehicle_current_status" ("meterId")
    `);

    // Index for charging state filtering
    await queryRunner.query(`
      CREATE INDEX "idx_vehicle_current_charging_state" 
      ON "vehicle_current_status" ("chargingState")
    `);

    // ============================================================
    // DEVICE MAPPING: Correlation Table
    // Maps meters to vehicles for correlation analytics
    // ============================================================
    await queryRunner.query(`
      CREATE TABLE "device_mapping" (
        "meterId" varchar(64) NOT NULL,
        "vehicleId" varchar(64) NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_device_mapping" PRIMARY KEY ("meterId", "vehicleId")
      )
    `);

    // Unique constraint for meter-vehicle pairs
    await queryRunner.query(`
      CREATE UNIQUE INDEX "idx_device_mapping_meter_vehicle" 
      ON "device_mapping" ("meterId", "vehicleId")
    `);

    // Index for active mapping queries
    await queryRunner.query(`
      CREATE INDEX "idx_device_mapping_active" 
      ON "device_mapping" ("isActive")
    `);

    // Enable uuid extension if not exists
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop tables in reverse order of dependencies
    await queryRunner.query(`DROP TABLE IF EXISTS "device_mapping"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "vehicle_current_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "meter_current_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "vehicle_telemetry_history"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "meter_telemetry_history"`);
    
    // Drop enum types
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."vehicle_charging_state_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."meter_status_enum"`);
  }
}
