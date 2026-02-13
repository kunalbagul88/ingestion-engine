# EV Ingestion Engine

High-Scale Energy Ingestion Engine for Fleet Management - Handles 10,000+ Smart Meters and EV Fleet telemetry streams.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Quick Start](#quick-start)
- [API Documentation](#api-documentation)
- [Database Design](#database-design)
- [Performance Considerations](#performance-considerations)
- [Configuration](#configuration)

## Architecture Overview

### Domain Context

The system manages two independent data streams arriving every 60 seconds:

1. **Smart Meter (Grid Side)**: Measures AC power pulled from the utility grid
   - Reports `kwhConsumedAc` (what the fleet owner is billed for)
   - Reports `voltage` for power quality monitoring

2. **EV & Charger (Vehicle Side)**: The charger converts AC to DC for the battery
   - Reports `kwhDeliveredDc` (actual energy stored)
   - Reports `soc` (State of Charge/Battery %)
   - Reports `batteryTemp` for thermal monitoring

### Power Loss Thesis

AC Consumed > DC Delivered due to heat and conversion loss. The efficiency ratio (DC/AC) should typically be 85-95%. A drop below 85% indicates:
- Hardware fault
- Energy leakage
- Charger malfunction

### Data Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     INGESTION LAYER                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │ Meter Stream │    │Vehicle Stream│    │ Batch Import │       │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘       │
│         │                   │                   │                │
│         └───────────────────┼───────────────────┘                │
│                             ▼                                    │
│                   ┌─────────────────┐                            │
│                   │ Polymorphic     │                            │
│                   │ Ingestion API   │                            │
│                   └────────┬────────┘                            │
└────────────────────────────┼────────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
   ┌─────────────────────┐      ┌─────────────────────┐
   │    HOT STORE        │      │    COLD STORE       │
   │  (Current Status)   │      │   (History)         │
   │                     │      │                     │
   │  • meter_current_   │      │  • meter_telemetry_ │
   │    status           │      │    history          │
   │  • vehicle_current_ │      │  • vehicle_telemetry│
   │    status           │      │    _history         │
   │                     │      │                     │
   │  UPSERT pattern     │      │  INSERT only        │
   │  ~10K rows max      │      │  Billions of rows   │
   │  O(1) lookups       │      │  Partitioned        │
   │                     │      │  Time-indexed       │
   └─────────────────────┘      └─────────────────────┘
              │                             │
              └──────────────┬──────────────┘
                             ▼
              ┌─────────────────────────────┐
              │      ANALYTICS LAYER        │
              │                             │
              │  • Efficiency calculations  │
              │  • Trend analysis           │
              │  • Fleet aggregations       │
              └─────────────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm or yarn

### Installation

```bash
# Clone and install dependencies
cd EV_Ingestion
npm install

# Configure environment
cp .env.example .env
# Edit .env with your database credentials

# Create database
createdb ev_ingestion

# Run migrations
npm run migration:run

# Start development server
npm run start:dev
```

### Verify Installation

```bash
# Check health
curl http://localhost:3000/health

# View API documentation
open http://localhost:3000/api/docs
```

## API Documentation

### Telemetry Ingestion

#### POST /v1/telemetry (Polymorphic)

Accepts both meter and vehicle telemetry based on `type` field.

**Meter Example:**
```json
{
  "type": "meter",
  "meterId": "METER-001-NYC",
  "kwhConsumedAc": 12.5432,
  "voltage": 240.5,
  "timestamp": "2026-02-12T10:30:00.000Z"
}
```

**Vehicle Example:**
```json
{
  "type": "vehicle",
  "vehicleId": "VH-TESLA-001",
  "soc": 75.5,
  "kwhDeliveredDc": 10.2345,
  "batteryTemp": 35.2,
  "timestamp": "2026-02-12T10:30:00.000Z"
}
```

#### POST /v1/telemetry/batch

Batch ingestion for high-throughput scenarios.

```json
{
  "readings": [
    { "type": "meter", "meterId": "M1", "kwhConsumedAc": 10.5, "voltage": 240, "timestamp": "..." },
    { "type": "vehicle", "vehicleId": "V1", "soc": 50, "kwhDeliveredDc": 8.5, "batteryTemp": 30, "timestamp": "..." }
  ]
}
```

#### POST /v1/telemetry/meter

Dedicated endpoint for Smart Meter heartbeats.

#### POST /v1/telemetry/vehicle

Dedicated endpoint for Vehicle heartbeats.

### Analytics

#### GET /v1/analytics/performance/:vehicleId

Returns 24-hour performance summary.

**Response:**
```json
{
  "vehicleId": "VH-TESLA-001",
  "periodStart": "2026-02-11T10:30:00.000Z",
  "periodEnd": "2026-02-12T10:30:00.000Z",
  "totalKwhConsumedAc": 150.5432,
  "totalKwhDeliveredDc": 127.9617,
  "efficiencyRatio": 0.85,
  "efficiencyStatus": "good",
  "avgBatteryTemp": 32.5,
  "maxBatteryTemp": 45.2,
  "minBatteryTemp": 22.1,
  "readingsCount": 1440,
  "meterId": "METER-001-NYC"
}
```

**Efficiency Status Thresholds:**
- `excellent`: >= 92%
- `good`: 85-92%
- `warning`: 75-85%
- `critical`: < 75%

#### GET /v1/analytics/fleet/efficiency

Fleet-wide efficiency summary.

#### GET /v1/analytics/trend/:vehicleId

Hourly efficiency breakdown for trend analysis.

### Real-time Status

#### GET /v1/status/overview

Fleet overview for dashboard.

#### GET /v1/status/meter/:meterId

Current meter status (O(1) lookup).

#### GET /v1/status/vehicle/:vehicleId

Current vehicle status including SoC and charging state.

#### GET /v1/status/vehicles/charging

All vehicles currently charging.

#### GET /v1/status/vehicles/warnings

Vehicles with battery temperature warnings.

## Database Design

### Hot Store vs Cold Store

| Aspect | Hot Store | Cold Store |
|--------|-----------|------------|
| Purpose | Dashboard queries | Historical analytics |
| Operation | UPSERT | INSERT only |
| Size | ~10K rows | Billions of rows |
| Lookup | O(1) by device ID | Indexed by (device, timestamp) |
| Tables | `*_current_status` | `*_telemetry_history` |

### Why This Separation?

1. **Avoid Full Table Scans**: Dashboard queries need current state, not history
2. **Write Optimization**: History tables are append-only (no locks for updates)
3. **Query Isolation**: Analytical queries don't impact real-time performance
4. **Data Management**: History can be partitioned, archived, or pruned independently

### Schema

```sql
-- Cold Store: Meter History
CREATE TABLE meter_telemetry_history (
  id UUID PRIMARY KEY,
  meterId VARCHAR(64),
  kwhConsumedAc DECIMAL(12,4),
  voltage DECIMAL(8,2),
  timestamp TIMESTAMPTZ,
  ingestedAt TIMESTAMPTZ,
  vehicleId VARCHAR(64)
);
-- Index: (meterId, timestamp) for efficient time-range queries

-- Hot Store: Meter Current Status
CREATE TABLE meter_current_status (
  meterId VARCHAR(64) PRIMARY KEY,
  kwhConsumedAc DECIMAL(12,4),
  voltage DECIMAL(8,2),
  lastReadingAt TIMESTAMPTZ,
  dailyKwhConsumedAc DECIMAL(14,4),
  status ENUM('online', 'offline', 'error')
);
-- O(1) lookup by meterId
```

### Index Strategy

The analytical query uses **indexed access** to avoid full table scans:

```sql
-- This query uses idx_vehicle_history_vehicle_timestamp
SELECT SUM(kwhDeliveredDc), AVG(batteryTemp)
FROM vehicle_telemetry_history
WHERE vehicleId = 'VH-TESLA-001'
  AND timestamp >= NOW() - INTERVAL '24 hours';
```

**EXPLAIN output shows Index Scan, not Seq Scan.**

### Partitioning (Production)

For billions of rows, enable time-based partitioning:

```bash
npm run migration:run  # Includes partitioning migration
```

Partitions are created monthly and enable:
- Partition pruning (skip irrelevant months)
- Easy archival (drop old partitions)
- Parallel maintenance

## Performance Considerations

### Write Path Optimization

1. **Dual-Write Strategy**: Single ingestion writes to both hot and cold stores
2. **Atomic UPSERT**: Uses PostgreSQL `ON CONFLICT` for atomic updates
3. **Connection Pooling**: 100 max connections with 10 min maintained

### Read Path Optimization

1. **Hot Store for Dashboards**: O(1) lookups, never scans history
2. **Composite Indexes**: `(deviceId, timestamp)` for range queries
3. **Partitioning**: Time-based partitions for billions of rows

### Throughput Estimates

| Metric | Value |
|--------|-------|
| Devices | 10,000 meters + 10,000 vehicles |
| Heartbeat Interval | 60 seconds |
| Writes per Second | ~333 (20K devices / 60s) |
| Daily Rows | ~28.8 million |
| Monthly Rows | ~864 million |

## Configuration

### Environment Variables

```bash
# Application
PORT=3000
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=ev_ingestion

# Thresholds
EFFICIENCY_WARNING_THRESHOLD=0.85
EFFICIENCY_CRITICAL_THRESHOLD=0.75
```

### Production Recommendations

1. **Connection Pool**: Increase pool size for higher throughput
2. **Partitioning**: Enable for tables > 100M rows
3. **Read Replicas**: Route analytics queries to replicas
4. **Caching**: Add Redis for hot store if needed
5. **Batch Ingestion**: Use batch endpoint for buffer flushes

## Project Structure

```
src/
├── main.ts                 # Application entry point
├── app.module.ts           # Root module
├── dto/                    # Data Transfer Objects
│   ├── meter-telemetry.dto.ts
│   ├── vehicle-telemetry.dto.ts
│   ├── polymorphic-telemetry.dto.ts
│   └── analytics.dto.ts
├── entities/               # TypeORM entities
│   ├── meter-telemetry-history.entity.ts
│   ├── vehicle-telemetry-history.entity.ts
│   ├── meter-current-status.entity.ts
│   ├── vehicle-current-status.entity.ts
│   └── device-mapping.entity.ts
├── modules/
│   ├── telemetry/          # Ingestion layer
│   ├── analytics/          # Performance analytics
│   ├── status/             # Real-time status
│   └── health/             # Health checks
└── database/
    ├── data-source.ts      # TypeORM configuration
    └── migrations/         # Database migrations
```

## License

MIT
