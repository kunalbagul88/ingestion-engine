import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  MeterTelemetryHistory,
  VehicleTelemetryHistory,
  DeviceMapping,
} from '../../entities';
import { AnalyticsService } from './services/analytics.service';
import { AnalyticsController } from './controllers/analytics.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MeterTelemetryHistory,
      VehicleTelemetryHistory,
      DeviceMapping,
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
