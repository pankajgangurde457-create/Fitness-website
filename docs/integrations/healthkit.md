# Apple HealthKit Integration

This adapter bridges the native iOS HealthKit SDK with the FitSync Integration Layer.

## Supported Data Types

- `steps` (count)
- `distance` (meters, converted from miles/km)
- `heart_rate` (bpm)
- `hrv` (ms, SDNN)
- `sleep` (minutes)
- `workout` (workout details: duration, type, calories, distance)

## Authentication Flow

1. **System Request**: The mobile app calls `requestAuthorization(toShare:read:)` presenting the native iOS HealthKit permission overlay.
2. **Granular Scopes**: The user can toggle individual permissions (e.g., allow heart rate but deny workouts).
3. **Internal Gating**: Antigravity's `PrivacyService` syncs these scopes to the PostgreSQL database to enforce ingestion-level restrictions.

## Background Synchronization

- **HKObserverQuery**: Sets up a native iOS background observer. When the device registers new steps or heart rate beats, iOS wakes up the app (even if terminated) to run the sync worker.
- **Battery Optimization**: iOS restricts background wakeups based on device activity and battery level (normally capped at once per 10-15 minute intervals for non-workout states).

## Vendor Quirks & Mitigations

1. **Source Overlaps**: Apple HealthKit aggregates step counts from the iPhone's internal accelerometer and Apple Watch. This adapter uses our `DeduplicationService` sliding window to prefer Apple Watch (higher confidence) and prevent double-counting.
2. **Permission Silent Denials**: HealthKit does not let the app know if a user denied read permissions (returns empty arrays instead of errors for security reasons). The adapter handles empty queries gracefully.
