import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Table partitioning migration for production scale
 * 
 * This migration sets up time-based partitioning for the history tables
 * to handle billions of rows efficiently. Partitioning provides:
 * 
 * 1. Faster queries: PostgreSQL can skip partitions that don't match the query
 * 2. Easier data management: Old partitions can be archived or dropped
 * 3. Improved vacuum performance: Each partition is maintained separately
 * 
 * IMPORTANT: This migration should be run on a fresh database or after
 * migrating existing data. Run with caution in production.
 */
export class AddPartitioning1707840000000 implements MigrationInterface {
  name = 'AddPartitioning1707840000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if tables already have data - if so, skip partitioning
    const meterCount = await queryRunner.query(
      `SELECT COUNT(*) FROM meter_telemetry_history`,
    );
    const vehicleCount = await queryRunner.query(
      `SELECT COUNT(*) FROM vehicle_telemetry_history`,
    );

    if (parseInt(meterCount[0].count) > 0 || parseInt(vehicleCount[0].count) > 0) {
      console.log('Tables contain data. Skipping partitioning migration.');
      console.log('To enable partitioning, migrate data to partitioned tables manually.');
      return;
    }

    // Drop existing non-partitioned tables
    await queryRunner.query(`DROP TABLE IF EXISTS "meter_telemetry_history"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "vehicle_telemetry_history"`);

    // ============================================================
    // Create partitioned meter_telemetry_history table
    // Partitioned by RANGE on timestamp (monthly partitions)
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
        CONSTRAINT "PK_meter_telemetry_history" PRIMARY KEY ("id", "timestamp")
      ) PARTITION BY RANGE ("timestamp")
    `);

    // Create partitions for the current and next 12 months
    const currentDate = new Date();
    for (let i = -1; i < 12; i++) {
      const partitionDate = new Date(currentDate);
      partitionDate.setMonth(currentDate.getMonth() + i);
      const year = partitionDate.getFullYear();
      const month = String(partitionDate.getMonth() + 1).padStart(2, '0');
      
      const nextMonth = new Date(partitionDate);
      nextMonth.setMonth(partitionDate.getMonth() + 1);
      const nextYear = nextMonth.getFullYear();
      const nextMonthStr = String(nextMonth.getMonth() + 1).padStart(2, '0');

      await queryRunner.query(`
        CREATE TABLE "meter_telemetry_history_${year}_${month}" 
        PARTITION OF "meter_telemetry_history"
        FOR VALUES FROM ('${year}-${month}-01') TO ('${nextYear}-${nextMonthStr}-01')
      `);
    }

    // Recreate indexes on partitioned table
    await queryRunner.query(`
      CREATE INDEX "idx_meter_history_meter_timestamp" 
      ON "meter_telemetry_history" ("meterId", "timestamp")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_meter_history_timestamp" 
      ON "meter_telemetry_history" ("timestamp")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_meter_history_meter_id" 
      ON "meter_telemetry_history" ("meterId")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_meter_history_vehicle_id" 
      ON "meter_telemetry_history" ("vehicleId")
    `);

    // ============================================================
    // Create partitioned vehicle_telemetry_history table
    // Partitioned by RANGE on timestamp (monthly partitions)
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
        CONSTRAINT "PK_vehicle_telemetry_history" PRIMARY KEY ("id", "timestamp")
      ) PARTITION BY RANGE ("timestamp")
    `);

    // Create partitions for the current and next 12 months
    for (let i = -1; i < 12; i++) {
      const partitionDate = new Date(currentDate);
      partitionDate.setMonth(currentDate.getMonth() + i);
      const year = partitionDate.getFullYear();
      const month = String(partitionDate.getMonth() + 1).padStart(2, '0');
      
      const nextMonth = new Date(partitionDate);
      nextMonth.setMonth(partitionDate.getMonth() + 1);
      const nextYear = nextMonth.getFullYear();
      const nextMonthStr = String(nextMonth.getMonth() + 1).padStart(2, '0');

      await queryRunner.query(`
        CREATE TABLE "vehicle_telemetry_history_${year}_${month}" 
        PARTITION OF "vehicle_telemetry_history"
        FOR VALUES FROM ('${year}-${month}-01') TO ('${nextYear}-${nextMonthStr}-01')
      `);
    }

    // Recreate indexes on partitioned table
    await queryRunner.query(`
      CREATE INDEX "idx_vehicle_history_vehicle_timestamp" 
      ON "vehicle_telemetry_history" ("vehicleId", "timestamp")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_vehicle_history_timestamp" 
      ON "vehicle_telemetry_history" ("timestamp")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_vehicle_history_vehicle_id" 
      ON "vehicle_telemetry_history" ("vehicleId")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_vehicle_history_meter_id" 
      ON "vehicle_telemetry_history" ("meterId")
    `);

    // ============================================================
    // Create function to auto-create future partitions
    // ============================================================
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION create_monthly_partition(
        table_name TEXT,
        partition_date DATE
      ) RETURNS VOID AS $$
      DECLARE
        partition_name TEXT;
        start_date DATE;
        end_date DATE;
      BEGIN
        partition_name := table_name || '_' || to_char(partition_date, 'YYYY_MM');
        start_date := date_trunc('month', partition_date);
        end_date := start_date + INTERVAL '1 month';
        
        EXECUTE format(
          'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
          partition_name, table_name, start_date, end_date
        );
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log('Partitioning setup complete. Remember to create new partitions monthly.');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop function
    await queryRunner.query(`DROP FUNCTION IF EXISTS create_monthly_partition`);
    
    // Note: Reverting partitioned tables to non-partitioned requires
    // data migration which is beyond the scope of a simple rollback
    console.log('Warning: Cannot automatically revert partitioned tables.');
    console.log('Manual data migration required to restore non-partitioned schema.');
  }
}
