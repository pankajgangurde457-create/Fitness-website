import { WearableAdapter, ConnectionResult, DataType, NormalizedEvent, Subscription } from '../types';
import { NormalizationService } from '../services/normalization.service';
import { getConsent } from '../database/pg-client';

export class BluetoothAdapter implements WearableAdapter {
  private activeSubscriptions: Map<string, NodeJS.Timeout> = new Map();
  private connectedDevices: Map<string, { deviceId: string; type: 'hr_strap' | 'scale' | 'watch' }> = new Map();
  private onDisconnectCallback: ((userId: string, error: string) => void) | null = null;

  getSupportedDataTypes(): DataType[] {
    return ['heart_rate', 'workout']; // Direct BLE pairings for heart rate straps or smart watches
  }

  // Register callback for when device disconnects mid-workout (graceful fallback trigger)
  setOnDisconnect(callback: (userId: string, error: string) => void) {
    this.onDisconnectCallback = callback;
  }

  async connect(userId: string): Promise<ConnectionResult> {
    // Simulate Bluetooth scan and pair
    console.log(`BluetoothAdapter: Scanning for BLE/ANT+ devices for user ${userId}...`);
    
    // Simulate finding a Polar H10 Heart Rate Strap
    const deviceId = 'BLE-HR-POLAR-H10';
    this.connectedDevices.set(userId, { deviceId, type: 'hr_strap' });
    
    console.log(`BluetoothAdapter: Paired and connected to ${deviceId} for user ${userId}`);
    
    return {
      success: true,
      scopesGranted: ['heart_rate']
    };
  }

  async disconnect(userId: string): Promise<void> {
    const device = this.connectedDevices.get(userId);
    if (device) {
      this.connectedDevices.delete(userId);
      console.log(`BluetoothAdapter: Disconnected BLE device ${device.deviceId} for user ${userId}`);
    }
    
    const timer = this.activeSubscriptions.get(userId);
    if (timer) {
      clearInterval(timer);
      this.activeSubscriptions.delete(userId);
    }
  }

  // Simulate a sudden disconnection mid-workout (e.g., hardware battery dead or range issues)
  simulateSuddenDisconnect(userId: string) {
    const device = this.connectedDevices.get(userId);
    if (device) {
      this.connectedDevices.delete(userId);
      const timer = this.activeSubscriptions.get(userId);
      if (timer) {
        clearInterval(timer);
        this.activeSubscriptions.delete(userId);
      }
      console.warn(`BluetoothAdapter: Device ${device.deviceId} disconnected unexpectedly for user ${userId}`);
      if (this.onDisconnectCallback) {
        this.onDisconnectCallback(userId, `BLE device ${device.deviceId} connection lost.`);
      }
    }
  }

  async fetchLatest(userId: string, dataTypes: DataType[]): Promise<NormalizedEvent[]> {
    if (!this.connectedDevices.has(userId)) {
      throw new Error(`BluetoothAdapter: No connected Bluetooth device for user ${userId}`);
    }

    const consent = await getConsent(userId);
    const allowedTypes = dataTypes.filter(type => {
      const supported = this.getSupportedDataTypes().includes(type);
      const consented = consent ? !!consent.grantedScopes[type] : true;
      return supported && consented;
    });

    const now = new Date();
    const events: NormalizedEvent[] = [];

    for (const type of allowedTypes) {
      if (type === 'heart_rate') {
        // Direct chest strap HR is high-precision
        const rawValue = Math.floor(Math.random() * 20) + 120; // Simulated workout HR: 120-140 bpm
        const normalized = NormalizationService.normalize(userId, 'bluetooth_device', 'heart_rate', {
          value: rawValue,
          unit: 'bpm',
          timestamp: now.toISOString(),
          confidence: 'high' // Direct chest straps are gold standard high confidence
        });
        events.push(normalized);
      }
    }

    return events;
  }

  subscribeToBackgroundUpdates(userId: string, callback: (event: NormalizedEvent) => void): Subscription {
    console.log(`BluetoothAdapter: Subscribed to live BLE notifications for user ${userId}`);
    
    // Simulate real-time BLE notifications (e.g. Heart Rate notification every 2 seconds)
    const intervalId = setInterval(async () => {
      try {
        const events = await this.fetchLatest(userId, ['heart_rate']);
        if (events.length > 0) {
          callback(events[0]);
        }
      } catch (err) {
        console.error('BluetoothAdapter live updates error:', err);
      }
    }, 2000);

    this.activeSubscriptions.set(userId, intervalId);

    return {
      unsubscribe: async () => {
        clearInterval(intervalId);
        this.activeSubscriptions.delete(userId);
        console.log(`BluetoothAdapter: Stopped BLE notification listener for user ${userId}`);
      }
    };
  }
}
