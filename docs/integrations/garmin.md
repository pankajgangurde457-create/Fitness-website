# Garmin Connect API Integration

This adapter handles connection and ingestion from the Garmin Connect Cloud platform.

## Supported Data Types

- `steps` (count)
- `distance` (meters)
- `heart_rate` (bpm)
- `sleep` (minutes)
- `workout` (swimming, running, cycling, custom workouts)

## Authentication Flow

1. **OAuth 1.0a / OAuth 2**: Generates Request Token, redirects user to Garmin Connect Portal, and exchanges Verifier for Access Token.
2. **Access Secrets**: Garmin OAuth 1.0a tokens do not expire, but require storing both the Access Token and the Access Token Secret in the database.

## Background Synchronization

- **Webhook Model**: Garmin does not support pulling from background mobile processes. Garmin Connect Cloud pushes health/activity events directly to our web backend via HTTPS webhook payloads (`dailies`, `sleeps`, `activities`).
- **Processing**: Webhook endpoints parse incoming packets using `parseGarminWebhookPayload` and stream them to the ingestion queue.

## Vendor Quirks & Mitigations

1. **Production Approval**: Garmin Developer Program requires a developer fee and manual approval. The adapter provides a complete webhook simulator to test payload models locally in sandbox environments.
2. **Epoch Time**: Garmin webhook event timestamps are provided in seconds since epoch. The adapter scales these by 1000 and parses them into standard ISO8601 strings.
