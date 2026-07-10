# Google Health Connect Integration

This adapter bridges the native Android Health Connect API (introduced natively in Android 14 / API 34) with the FitSync Integration Layer.

## Supported Data Types

- `steps` (count)
- `distance` (meters)
- `heart_rate` (bpm)
- `sleep` (minutes)
- `calories` (kcal, active energy burned)
- `workout` (workout sessions)

## Authentication Flow

1. **Android Intent**: The application launches the Health Connect permission intent: `PermissionController.createRequestPermissionResultContract()`.
2. **Granular Settings**: The user selects which permissions to grant in the Android system settings.
3. **Token Management**: Handled natively on-device. The sync client requests permission status before triggering read/write sessions.

## Background Synchronization

- **WorkManager**: Uses Android's `WorkManager` API to run background tasks.
- **Battery Optimization**: Tasks are scheduled using `Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).setRequiresBatteryNotLow(true)` to comply with Android system policies and maintain the 5% daily battery budget.

## Vendor Quirks & Mitigations

1. **Device Availability**: Health Connect is only supported on Android 6.0+ devices. On older devices, the adapter gracefully disables itself or falls back to direct Google Fit API integrations.
2. **Historical Read Restrictions**: Users can restrict apps from reading data older than 30 days. The sync pipeline handles partial historical queries by starting incremental syncs from the last successfully uploaded timestamp.
