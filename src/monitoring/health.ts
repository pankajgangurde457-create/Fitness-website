export interface AdapterHealthStatus {
  name: string;
  status: 'healthy' | 'unhealthy' | 'rate_limited' | 'auth_error';
  lastSyncTime: string | null;
  errorLog: string[];
  latencyMs: number;
}

export class IntegrationMonitor {
  private static healthRegistry: Map<string, AdapterHealthStatus> = new Map();

  static initialize() {
    const adapters = ['healthkit', 'health_connect', 'fitbit', 'garmin', 'bluetooth_device', 'google_calendar'];
    for (const adapter of adapters) {
      this.healthRegistry.set(adapter, {
        name: adapter,
        status: 'healthy',
        lastSyncTime: null,
        errorLog: [],
        latencyMs: 0
      });
    }
  }

  /**
   * Log a successful sync metric.
   */
  static logSuccess(adapterName: string, latencyMs: number) {
    const record = this.healthRegistry.get(adapterName);
    if (record) {
      record.status = 'healthy';
      record.lastSyncTime = new Date().toISOString();
      record.latencyMs = latencyMs;
      this.healthRegistry.set(adapterName, record);
    }
  }

  /**
   * Log a connection or API error.
   */
  static logError(adapterName: string, error: string, type: 'general' | 'rate_limit' | 'auth') {
    const record = this.healthRegistry.get(adapterName);
    if (record) {
      let status: AdapterHealthStatus['status'] = 'unhealthy';
      if (type === 'rate_limit') status = 'rate_limited';
      if (type === 'auth') status = 'auth_error';

      record.status = status;
      record.errorLog.unshift(`[${new Date().toISOString()}] ${error}`);
      
      // Cap errors
      if (record.errorLog.length > 20) {
        record.errorLog.pop();
      }

      this.healthRegistry.set(adapterName, record);
      
      // Smart trigger for push notification/alert on major failure (simulation)
      console.error(`MONITOR ALERT: Adapter '${adapterName}' entered state '${status}'. Detail: ${error}`);
    }
  }

  /**
   * Get all registered adapter healths.
   */
  static getHealthReport(): AdapterHealthStatus[] {
    if (this.healthRegistry.size === 0) {
      this.initialize();
    }
    return Array.from(this.healthRegistry.values());
  }

  /**
   * Clear error history.
   */
  static resetHealth(adapterName: string) {
    const record = this.healthRegistry.get(adapterName);
    if (record) {
      record.status = 'healthy';
      record.errorLog = [];
      this.healthRegistry.set(adapterName, record);
    }
  }
}
