import {
  Processor,
  Process,
  OnQueueFailed,
  OnQueueCompleted,
} from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { StellarTransactionService } from '../services/stellar-transaction.service';
import { DonationsService } from '../../donations/donations.service';
import { DonationStatus } from '../../donations/enums/donation-status.enum';

export interface TransactionValidationJob {
  donationId: string;
  transactionHash: string;
  expectedAmount: string;
  expectedAsset: string;
  destinationAddress: string;
}
// jj
@Processor('transactions')
export class TransactionsJobProcessor {
  private readonly logger = new Logger(TransactionsJobProcessor.name);

  constructor(
    private readonly stellarTransactionService: StellarTransactionService,
    private readonly donationsService: DonationsService,
  ) {}

  @Process('validate-transaction')
  async handleValidateTransaction(
    job: Job<TransactionValidationJob>,
  ): Promise<void> {
    const {
      donationId,
      transactionHash,
      expectedAmount,
      expectedAsset,
      destinationAddress,
    } = job.data;

    this.logger.log(
      `Validating transaction ${transactionHash} for donation ${donationId} (attempt ${job.attemptsMade + 1})`,
    );

    // 1. Fetch transaction from Stellar network
    const txResult =
      await this.stellarTransactionService.fetchTransaction(transactionHash);

    // 2. Handle pending transactions — throw so Bull retries
    if (txResult.status === 'pending') {
      this.logger.warn(
        `Transaction ${transactionHash} is still pending. Will retry.`,
      );
      throw new Error(`Transaction ${transactionHash} is pending`);
    }

    // 3. Handle failed transactions on the network
    if (txResult.status === 'failed') {
      this.logger.error(
        `Transaction ${transactionHash} failed on the Stellar network.`,
      );
      await this.donationsService.updateStatus(
        donationId,
        DonationStatus.FAILED,
        { failureReason: 'Transaction failed on Stellar network' },
      );
      return;
    }

    // 4. Validate destination address
    if (txResult.destinationAddress !== destinationAddress) {
      this.logger.error(
        `Destination mismatch for tx ${transactionHash}. Expected: ${destinationAddress}, Got: ${txResult.destinationAddress}`,
      );
      await this.donationsService.updateStatus(
        donationId,
        DonationStatus.FAILED,
        { failureReason: 'Destination address mismatch' },
      );
      return;
    }

    // 5. Validate asset type
    if (txResult.asset !== expectedAsset) {
      this.logger.error(
        `Asset mismatch for tx ${transactionHash}. Expected: ${expectedAsset}, Got: ${txResult.asset}`,
      );
      await this.donationsService.updateStatus(
        donationId,
        DonationStatus.FAILED,
        { failureReason: 'Asset type mismatch' },
      );
      return;
    }

    // 6. Validate amount (allow minor floating-point tolerance)
    const amountDiff = Math.abs(
      parseFloat(txResult.amount) - parseFloat(expectedAmount),
    );
    if (amountDiff > 0.0000001) {
      this.logger.error(
        `Amount mismatch for tx ${transactionHash}. Expected: ${expectedAmount}, Got: ${txResult.amount}`,
      );
      await this.donationsService.updateStatus(
        donationId,
        DonationStatus.FAILED,
        { failureReason: 'Transaction amount mismatch' },
      );
      return;
    }

    // 7. All checks passed — confirm donation
    await this.donationsService.updateStatus(
      donationId,
      DonationStatus.CONFIRMED,
      {
        confirmedAt: new Date(),
        transactionHash,
      },
    );

    this.logger.log(
      `Donation ${donationId} confirmed via transaction ${transactionHash}`,
    );
  }

  @OnQueueFailed()
  async onFailed(job: Job<TransactionValidationJob>, error: Error) {
    const { donationId, transactionHash } = job.data;
    this.logger.error(
      `Job ${job.id} failed for donation ${donationId} (tx: ${transactionHash}) after ${job.attemptsMade} attempts: ${error.message}`,
    );

    // If all retries are exhausted, mark as failed
    if (job.attemptsMade >= (job.opts.attempts ?? 5)) {
      this.logger.error(
        `All retry attempts exhausted for donation ${donationId}. Marking as FAILED.`,
      );
      await this.donationsService.updateStatus(
        donationId,
        DonationStatus.FAILED,
        { failureReason: `Validation exhausted after ${job.attemptsMade} attempts: ${error.message}` },
      );
    }
  }

  @OnQueueCompleted()
  onCompleted(job: Job<TransactionValidationJob>) {
    this.logger.log(
      `Job ${job.id} completed for donation ${job.data.donationId}`,
    );
  }
}