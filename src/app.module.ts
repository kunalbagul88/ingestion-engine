import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelemetryModule } from './modules/telemetry/telemetry.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { StatusModule } from './modules/status/status.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    // Configuration module - loads .env file
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.example'],
    }),

    // TypeORM database connection
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get<string>('DB_USERNAME', 'postgres'),
        password: configService.get<string>('DB_PASSWORD', 'postgres'),
        database: configService.get<string>('DB_NAME', 'ev_ingestion'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: false, // Disabled - use migrations instead (required for partitioned tables)
        logging: configService.get<string>('NODE_ENV') === 'development',
        ssl: configService.get<string>('DB_SSL') === 'true' ? { rejectUnauthorized: false } : false,
        // Connection pool settings for high-scale ingestion
        extra: {
          max: 100, // Maximum connections in pool
          min: 10,  // Minimum connections in pool
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        },
      }),
      inject: [ConfigService],
    }),

    // Feature modules
    TelemetryModule,
    AnalyticsModule,
    StatusModule,
    HealthModule,
  ],
})
export class AppModule {}
