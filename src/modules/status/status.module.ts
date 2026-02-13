import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MeterCurrentStatus, VehicleCurrentStatus } from '../../entities';
import { StatusService } from './services/status.service';
import { StatusController } from './controllers/status.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([MeterCurrentStatus, VehicleCurrentStatus]),
  ],
  controllers: [StatusController],
  providers: [StatusService],
  exports: [StatusService],
})
export class StatusModule {}
