# Direct Bluetooth (BLE) / ANT+ Integration

This adapter communicates directly with peripheral fitness sensors (e.g. chest heart-rate straps, smartwatches, smart scales) via Bluetooth Low Energy (BLE).

## Supported Data Types

- `heart_rate` (bpm, high-precision)
- `workout` (workout sessions synced from smart training devices)

## Authentication Flow

1. **Scan and Connect**: Mobile client scans for BLE peripherals advertising specific services.
2. **GATT Pairing**: Connects to the device and performs pairing/bonding if requested.
3. **Internal Log**: Stores the device MAC address / UUID locally in the database.

## GATT Services Used

- **Heart Rate Service (`0x180D`)**: Subscribes to notifications on the Heart Rate Measurement characteristic (`0x2A37`) to read real-time BPM values.
- **Weight Scale Service (`0x181D`)**: Subscribes to weight measurement data (`0x2A9D`) from smart scales.

## Graceful Fallback (Mid-Workout Disconnect)

- **Scenario**: If a BLE heart-rate strap runs out of battery or goes out of range mid-workout, the adapter triggers the `onDisconnect` listener.
- **Action**: The system detects the loss, updates the monitoring status, sends a Firebase push alert to the user, and immediately falls back to phone sensors (Apple HealthKit / Google Health Connect) to continue tracking metrics without losing user progress.
