# Fitbit Web API Integration

This adapter communicates with the Fitbit Cloud Service using the Fitbit Web API.

## Supported Data Types

- `steps` (count)
- `heart_rate` (bpm, including Intraday series if authorized)
- `sleep` (minutes and sleep stages)
- `calories` (kcal)

## Authentication Flow

1. **OAuth2.0 PKCE**: Initiates the OAuth2.0 authorization code flow with Proof Key for Code Exchange (PKCE).
2. **Access & Refresh Tokens**: Tokens are stored securely in the Postgres metadata store.
3. **Token Refresh**: The adapter automatically monitors token expiry and executes refreshes (`grant_type=refresh_token`) before fetching data.

## Rate Limits

- **150 Requests/Hour**: Fitbit limits API requests to 150 per user per hour.
- **Mitigation**: The adapter checks for HTTP 429 status codes, reads the `Retry-After` header, throttles queries, and notifies the `IntegrationMonitor` service to log the `rate_limited` state.

## Vendor Quirks & Mitigations

1. **Time Zones**: Fitbit API returns timestamps in the user's home profile timezone rather than UTC. The adapter reads the user profile timezone first and converts the local time string into standard UTC ISO8601 timestamps before normalization.
2. **Subscription Webhooks**: Fitbit pushes real-time updates via Webhooks. To avoid server overload, our server acknowledges Fitbit's HTTP 204 challenge within 3 seconds, queuing incoming payloads to the `IngestionQueue` for background processing.
