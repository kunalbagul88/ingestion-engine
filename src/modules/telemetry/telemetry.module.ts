import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  MeterTelemetryHistory,
  VehicleTelemetryHistory,
  MeterCurrentStatus,
  VehicleCurrentStatus,
  DeviceMapping,
} from '../../entities';
import { TelemetryService } from './services/telemetry.service';
import { TelemetryController } from './controllers/telemetry.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MeterTelemetryHistory,
      VehicleTelemetryHistory,
      MeterCurrentStatus,
      VehicleCurrentStatus,
      DeviceMapping,
    ]),
  ],
  controllers: [TelemetryController],
  providers: [TelemetryService],
  exports: [TelemetryService],
})
export class TelemetryModule {}
