import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Donation } from '../../donations/entities/donation.entity';
import { Project } from '../../projects/entities/project.entity';
import { StellarBlockchainService } from './stellar-blockchain.service';
import { Horizon } from '@stellar/stellar-sdk';

interface StellarTransaction {
  id: string;
  paging_token: string;
  successful: boolean;
  source_account: string;
  created_at: string;
  memo?: string;
  operations: Array<{
    id: string;
    type: string;
    type_i: number;
    asset_type?: string;
    asset_code?: string;
    asset_issuer?: string;
    from?: string;
    to?: string;
    amount?: string;
  }>;
}

@Injectable()
export class StellarSyncProcessorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StellarSyncProcessorService.name);
  private readonly server: Horizon.Server;
  private readonly platformWalletAddresses: string[];
  private readonly pollingInterval: number;
  private readonly maxRetries: number;
  private pollTimer: NodeJS.Timeout | null = null;
  private lastPagingToken: string | null = null;
  private isProcessing = false;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Donation)
    private readonly donationRepository: Repository<Donation>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    private readonly stellarBlockchainService: StellarBlockchainService,
  ) {
    const horizonUrl = this.configService.get<string>(
      'STELLAR_HORIZON_URL',
      'https://horizon-testnet.stellar.org',
    );

    this.server = new Horizon.Server(horizonUrl);
    
    // Get platform wallet addresses from config
    const platformAddresses = this.configService.get<string>(
      'STELLAR_PLATFORM_ADDRESSES',
      '',
    );
    this.platformWalletAddresses = platformAddresses
      ? platformAddresses.split(',').map(addr => addr.trim())
      : [];

    // Configuration
    this.pollingInterval = this.configService.get<number>(
      'STELLAR_POLLING_INTERVAL_SECONDS',
      30,
    ) * 1000;

    this.maxRetries = this.configService.get<number>(
      'STELLAR_POLLING_MAX_RETRIES',
      3,
    );

    this.logger.log(`StellarSyncProcessor initialized with polling interval: ${this.pollingInterval}ms`);
    this.logger.log(`Platform wallet addresses: ${this.platformWalletAddresses.join(', ')}`);
  }

  async onModuleInit() {
    if (this.platformWalletAddresses.length === 0) {
      this.logger.warn('No platform wallet addresses configured. Stellar sync will not start.');
      return;
    }

    // Load the last paging token if available
    await this.loadLastPagingToken();
    
    // Start polling
    this.startPolling();
  }

  async onModuleDestroy() {
    this.stopPolling();
  }

  private startPolling() {
    this.logger.log('Starting Stellar Horizon polling...');
    
    // Initial poll
    this.pollTransactions();
    
    // Set up recurring polling
    this.pollTimer = setInterval(() => {
      this.pollTransactions();
    }, this.pollingInterval);
  }

  private stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
      this.logger.log('Stopped Stellar Horizon polling');
    }
  }

  private async pollTransactions() {
    if (this.isProcessing) {
      this.logger.debug('Already processing transactions, skipping this poll');
      return;
    }

    this.isProcessing = true;

    try {
      await this.fetchAndProcessTransactions();
    } catch (error) {
      this.logger.error('Error during transaction polling:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async fetchAndProcessTransactions() {
    let retries = 0;
    
    while (retries < this.maxRetries) {
      try {
        // Build query for transactions to platform wallets
        let query = this.server
          .transactions()
          .forAccount(this.platformWalletAddresses[0]) // Use first address for now
          .order('asc')
          .limit(10);

        if (this.lastPagingToken) {
          query = query.cursor(this.lastPagingToken);
        }

        const response = await query.call();
        const transactions = response.records;

        if (transactions.length === 0) {
          this.logger.debug('No new transactions found');
          break;
        }

        this.logger.log(`Found ${transactions.length} new transactions to process`);

        // Process each transaction
        for (const transaction of transactions) {
          await this.processTransaction(transaction);
          this.lastPagingToken = transaction.paging_token;
        }

        // Save the last paging token
        await this.saveLastPagingToken(this.lastPagingToken);

        break; // Success, exit retry loop

      } catch (error) {
        retries++;
        this.logger.error(`Error fetching transactions (attempt ${retries}/${this.maxRetries}):`, error);
        
        if (retries >= this.maxRetries) {
          this.logger.error('Max retries reached, giving up for this polling cycle');
          return;
        }

        // Exponential backoff
        const delay = Math.pow(2, retries) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  private async processTransaction(transaction: StellarTransaction) {
    try {
      if (!transaction.successful) {
        this.logger.debug(`Skipping unsuccessful transaction ${transaction.id}`);
        return;
      }

      // Check if transaction is already processed
      const existingDonation = await this.donationRepository.findOne({
        where: { transactionHash: transaction.id },
      });

      if (existingDonation) {
        this.logger.debug(`Transaction ${transaction.id} already processed`);
        return;
      }

      // Parse memo for project identification
      const projectId = this.extractProjectIdFromMemo(transaction.memo);
      if (!projectId) {
        this.logger.debug(`No project ID found in memo for transaction ${transaction.id}`);
        return;
      }

      // Verify project exists
      const project = await this.projectRepository.findOne({
        where: { id: projectId },
      });

      if (!project) {
        this.logger.warn(`Project ${projectId} not found for transaction ${transaction.id}`);
        return;
      }

      // Find payment operations
      for (const operation of transaction.operations) {
        if (operation.type === 'payment' && operation.to && operation.amount) {
          await this.processPaymentOperation(operation, transaction, projectId, project);
        }
      }

    } catch (error) {
      this.logger.error(`Error processing transaction ${transaction.id}:`, error);
    }
  }

  private async processPaymentOperation(
    operation: any,
    transaction: StellarTransaction,
    projectId: string,
    project: Project,
  ) {
    try {
      // Verify the payment is to our platform wallet
      if (!this.platformWalletAddresses.includes(operation.to)) {
        this.logger.debug(`Payment not to platform wallet: ${operation.to}`);
        return;
      }

      const amount = parseFloat(operation.amount);
      const assetType = this.getAssetType(operation);

      // Verify the transaction using our existing service
      const verification = await this.stellarBlockchainService.verifyTransaction(
        transaction.id,
        amount,
        assetType,
        operation.to,
      );

      if (!verification.isValid) {
        this.logger.warn(`Transaction verification failed for ${transaction.id}: ${verification.error}`);
        return;
      }

      // Create donation record
      const donation = this.donationRepository.create({
        projectId,
        amount,
        assetType,
        transactionHash: transaction.id,
        isAnonymous: true, // Default to anonymous for blockchain donations
        donorId: null, // Will be matched later if possible
      });

      await this.donationRepository.save(donation);

      // Update project funds
      project.fundsRaised = Number(project.fundsRaised) + amount;
      project.donationCount += 1;
      project.progress = (project.fundsRaised / Number(project.goalAmount)) * 100;

      await this.projectRepository.save(project);

      this.logger.log(
        `Successfully processed donation: ${amount} ${assetType} to project ${projectId} (TX: ${transaction.id})`,
      );

    } catch (error) {
      this.logger.error(`Error processing payment operation ${operation.id}:`, error);
    }
  }

  private extractProjectIdFromMemo(memo?: string): string | null {
    if (!memo) return null;

    // Try to extract project ID from memo
    // Expected format: "PROJECT_ID" or "donation:PROJECT_ID"
    const patterns = [
      /^donation:(.+)$/,
      /^(.+)$/,
    ];

    for (const pattern of patterns) {
      const match = memo.match(pattern);
      if (match && match[1]) {
        const projectId = match[1].trim();
        // Basic UUID validation
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) {
          return projectId;
        }
      }
    }

    return null;
  }

  private getAssetType(operation: any): string {
    if (operation.asset_type === 'native') {
      return 'XLM';
    }
    
    if (operation.asset_code) {
      return operation.asset_code.toUpperCase();
    }

    return 'XLM'; // Default to XLM
  }

  private async loadLastPagingToken(): Promise<void> {
    try {
      // In a real implementation, you would store this in database or Redis
      // For now, we'll use environment variable as a simple persistence
      const token = this.configService.get<string>('STELLAR_LAST_PAGING_TOKEN');
      if (token) {
        this.lastPagingToken = token;
        this.logger.log(`Loaded last paging token: ${token}`);
      }
    } catch (error) {
      this.logger.error('Error loading last paging token:', error);
    }
  }

  private async saveLastPagingToken(token: string): Promise<void> {
    try {
      // In a real implementation, you would store this in database or Redis
      // For now, we'll just log it
      this.logger.log(`Saving paging token: ${token}`);
      // You could update an environment variable or database record here
    } catch (error) {
      this.logger.error('Error saving paging token:', error);
    }
  }

  // Manual trigger for testing
  async triggerSync(): Promise<{ processed: number; errors: string[] }> {
    this.logger.log('Manual sync triggered');
    
    const originalToken = this.lastPagingToken;
    const errors: string[] = [];
    let processed = 0;

    try {
      await this.fetchAndProcessTransactions();
      processed = 1; // Simplified count
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }

    return { processed, errors };
  }

  // Get sync status
  getSyncStatus(): {
    isRunning: boolean;
    lastPagingToken: string | null;
    platformAddresses: string[];
    pollingInterval: number;
  } {
    return {
      isRunning: this.pollTimer !== null,
      lastPagingToken: this.lastPagingToken,
      platformAddresses: this.platformWalletAddresses,
      pollingInterval: this.pollingInterval,
    };
  }
}
