import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { TransactionValidationJob } from '../processors/transactions.processor';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    @InjectQueue('projects') private readonly projectsQueue: Queue,
    @InjectQueue('transactions') private readonly transactionsQueue: Queue,
  ) {}

  // ── Existing projects jobs ────────────────────────────────────────────────

  async addProjectExpiryJob(projectId: string, delay: number): Promise<void> {
    await this.projectsQueue.add(
      'check-expiry',
      { projectId },
      { delay },
    );
    this.logger.log(`Queued expiry check for project ${projectId} in ${delay}ms`);
  }

  // ── Transaction validation jobs ───────────────────────────────────────────

  /**
   * Queue a transaction validation job immediately.
   * Bull will retry up to 5 times with exponential back-off (see jobs.module.ts).
   */
  async addTransactionValidationJob(
    payload: TransactionValidationJob,
  ): Promise<void> {
    await this.transactionsQueue.add('validate-transaction', payload);
    this.logger.log(
      `Queued transaction validation for donation ${payload.donationId} (tx: ${payload.transactionHash})`,
    );
  }

  /**
   * Retry validation for a specific donation after a custom delay (ms).
   * Useful when the caller knows the transaction is pending.
   */
  async retryTransactionValidation(
    payload: TransactionValidationJob,
    delayMs = 30_000,
  ): Promise<void> {
    await this.transactionsQueue.add('validate-transaction', payload, {
      delay: delayMs,
    });
    this.logger.log(
      `Scheduled retry validation for donation ${payload.donationId} in ${delayMs}ms`,
    );
  }
}