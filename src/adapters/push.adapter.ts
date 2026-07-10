export type NotificationType = 'inactivity_alert' | 'hydration_reminder' | 'recovery_update' | 'general';

export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface SentNotificationRecord {
  notificationId: string;
  userId: string;
  type: NotificationType;
  payload: NotificationPayload;
  sentAt: string;
}

export class PushNotificationAdapter {
  private static sentRegistry: SentNotificationRecord[] = [];
  private static userTokens: Map<string, string[]> = new Map();

  /**
   * Register a push token (FCM token or OneSignal player ID) for a user.
   */
  static async registerPushToken(userId: string, token: string): Promise<void> {
    const tokens = this.userTokens.get(userId) || [];
    if (!tokens.includes(token)) {
      tokens.push(token);
      this.userTokens.set(userId, tokens);
    }
    console.log(`PushNotificationAdapter: Registered push token for user ${userId}: ${token}`);
  }

  /**
   * Generic interface to send notification, decoupled from specific alert content.
   */
  static async sendNotification(
    userId: string,
    type: NotificationType,
    payload: NotificationPayload
  ): Promise<boolean> {
    const tokens = this.userTokens.get(userId) || [];
    const notificationId = 'notif_' + Math.random().toString(36).substring(2, 10);
    const sentAt = new Date().toISOString();

    const record: SentNotificationRecord = {
      notificationId,
      userId,
      type,
      payload,
      sentAt
    };

    this.sentRegistry.unshift(record);
    // Keep registry capped at 50 for memory
    if (this.sentRegistry.length > 50) {
      this.sentRegistry.pop();
    }

    if (tokens.length === 0) {
      console.warn(`PushNotificationAdapter: Attempted to send notification of type '${type}' to user '${userId}', but no push tokens were registered. Logging to sandbox registry.`);
      return true;
    }

    console.log(`PushNotificationAdapter: Dispatching push notification [${notificationId}] of type '${type}' to user '${userId}' across ${tokens.length} devices.`);
    console.log(`Payload: Title: "${payload.title}" | Body: "${payload.body}"`);
    
    // Simulate FCM/OneSignal HTTP post request to push server
    // e.g. axios.post('https://fcm.googleapis.com/fcm/send', ...)
    
    return true;
  }

  /**
   * Retrieve registry of sent notifications (for manual inspection/dashboard verification).
   */
  static getSentNotifications(userId?: string): SentNotificationRecord[] {
    if (userId) {
      return this.sentRegistry.filter(r => r.userId === userId);
    }
    return this.sentRegistry;
  }

  static clearRegistry(): void {
    this.sentRegistry = [];
  }
}
