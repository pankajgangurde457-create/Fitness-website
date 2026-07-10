import { queuePush, queuePop, queueLength } from '../database/redis-client';
import { saveEvents } from '../database/timeseries-client';
import { NormalizedEvent } from '../types';
import { DeduplicationService } from './deduplication.service';

export class IngestionQueue {
  private static QUEUE_NAME = 'fitsync_ingestion_queue';
  private static workerInterval: NodeJS.Timeout | null = null;
  private static isProcessing = false;
  private static BATCH_SIZE = 100;

  /**
   * Pushes a batch of normalized events onto the queue.
   */
  static async pushEvents(events: NormalizedEvent[]): Promise<void> {
    for (const event of events) {
      await queuePush(this.QUEUE_NAME, JSON.stringify(event));
    }
  }

  /**
   * Starts the background worker to process queue items in batches.
   */
  static startWorker(intervalMs = 1000): void {
    if (this.workerInterval) return;

    console.log('IngestionQueue: Starting background worker...');
    this.workerInterval = setInterval(async () => {
      if (this.isProcessing) return;
      
      try {
        await this.processQueue();
      } catch (err) {
        console.error('IngestionQueue: Error in queue worker loop:', err);
      }
    }, intervalMs);
  }

  /**
   * Stops the background worker.
   */
  static stopWorker(): void {
    if (this.workerInterval) {
      clearInterval(this.workerInterval);
      this.workerInterval = null;
      console.log('IngestionQueue: Queue worker stopped.');
    }
  }

  /**
   * Processes available items up to BATCH_SIZE.
   * Deduplicates the events in the batch before saving to database.
   */
  private static async processQueue(): Promise<void> {
    const len = await queueLength(this.QUEUE_NAME);
    if (len === 0) return;

    this.isProcessing = true;
    const batch: NormalizedEvent[] = [];

    // Pull up to BATCH_SIZE items from the queue
    for (let i = 0; i < Math.min(len, this.BATCH_SIZE); i++) {
      const item = await queuePop(this.QUEUE_NAME);
      if (item) {
        try {
          batch.push(JSON.parse(item));
        } catch (e) {
          console.error('IngestionQueue: Failed to parse queue item:', item);
        }
      }
    }

    if (batch.length > 0) {
      try {
        // Deduplicate the batch events
        const deduplicated = DeduplicationService.deduplicate(batch);
        
        // Save to time-series DB
        await saveEvents(deduplicated);
        console.log(`IngestionQueue: Successfully processed ${batch.length} events (${deduplicated.length} after deduplication).`);
      } catch (err) {
        console.error('IngestionQueue: Failed to save batch events to database, re-queuing:', err);
        // Put them back in queue in case of DB downtime
        await this.pushEvents(batch);
      }
    }

    this.isProcessing = false;
  }
}
