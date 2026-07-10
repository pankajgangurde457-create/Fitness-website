export const mockAppleHealthKitRaw = {
  steps: {
    value: 120,
    unit: 'count',
    timestamp: '2026-07-10T12:00:00.000Z'
  },
  distance: {
    value: 0.1,
    unit: 'miles',
    timestamp: '2026-07-10T12:00:00.000Z'
  },
  heartRate: {
    value: 72,
    unit: 'bpm',
    timestamp: '2026-07-10T12:00:00.000Z'
  },
  hrv: {
    value: 55,
    unit: 'ms',
    timestamp: '2026-07-10T12:00:00.000Z'
  },
  sleep: {
    value: 450,
    unit: 'minutes',
    timestamp: '2026-07-10T06:00:00.000Z'
  },
  workout: {
    value: {
      type: 'running',
      duration: 1800,
      calories: 300,
      distance: 3.1
    },
    unit: 'workout',
    timestamp: '2026-07-10T10:00:00.000Z'
  }
};

export const mockGoogleHealthConnectRaw = {
  steps: {
    value: 150,
    unit: 'count',
    timestamp: '2026-07-10T12:00:00.000Z'
  },
  distance: {
    value: 200, // Health Connect defaults to meters
    unit: 'meters',
    timestamp: '2026-07-10T12:00:00.000Z'
  },
  heartRate: {
    value: 75,
    unit: 'bpm',
    timestamp: '2026-07-10T12:00:05.000Z'
  },
  sleep: {
    value: 420,
    unit: 'minutes',
    timestamp: '2026-07-10T06:00:00.000Z'
  },
  calories: {
    value: 12.5,
    unit: 'kcal',
    timestamp: '2026-07-10T12:00:00.000Z'
  }
};

export const mockFitbitRaw = {
  steps: {
    value: 90,
    unit: 'count',
    timestamp: '2026-07-10T12:05:00.000Z'
  },
  heartRate: {
    value: 80,
    unit: 'bpm',
    timestamp: '2026-07-10T12:05:00.000Z'
  }
};

export const mockGarminWebhookPayload = {
  activities: [
    {
      activityType: 'swimming',
      durationInSeconds: 1500,
      activeKilocalories: 350,
      distanceInMeters: 1000,
      averageHeartRateInBeatsPerMinute: 135,
      startTimeInSeconds: 1783684800, // 2026-07-10T12:00:00Z
      steps: 45
    }
  ],
  dailies: [
    {
      startTimeInSeconds: 1783641600, // 2026-07-10T00:00:00Z
      steps: 8500,
      distanceInMeters: 6200
    }
  ]
};

export const mockBleHeartRatePacket = {
  value: 138,
  unit: 'bpm',
  timestamp: '2026-07-10T12:01:00.000Z'
};
