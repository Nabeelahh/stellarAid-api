import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Cache for verification results
const verificationCache = new Map<
  string,
  { result: TransactionVerificationResult; timestamp: number }
>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Supported asset types
const SUPPORTED_ASSETS = ['XLM', 'USDC', 'NGNT'];

// Known Stellar addresses for the platform (should be configured)
const PLATFORM_DISTRIBUTING_ADDRESSES = new Set<string>();

interface StellarTransaction {
  id: string;
  envelope_xdr: string;
  result_xdr: string;
  result_meta_xdr: string;
  created_at: string;
  successful: boolean;
  memo?: string;
  memo_type?: string;
  tx: {
    source_account: string;
    fee: number;
    seq_num: string;
    operations: Array<{
      type: string;
      [key: string]: unknown;
    }>;
  };
}

interface TransactionVerificationResult {
  isValid: boolean;
  transaction?: StellarTransaction;
  amount?: number;
  asset?: string;
  sourceAccount?: string;
  destinationAccount?: string;
  projectId?: string;
  timestamp?: Date;
  errors?: string[];
  error?: string;
}

@Injectable()
export class StellarBlockchainService {
  private readonly logger = new Logger(StellarBlockchainService.name);
  private readonly horizonUrl: string;
  private readonly stellarNetwork: string;
  private readonly platformAddresses: Set<string> = new Set<string>();

  constructor(private configService: ConfigService) {
    this.horizonUrl = this.configService.get<string>(
      'STELLAR_HORIZON_URL',
      'https://horizon-testnet.stellar.org',
    );
    this.stellarNetwork = this.configService.get<string>(
      'STELLAR_NETWORK',
      'TESTNET',
    );

    // Load platform distributing addresses from config
    const platformAddresses = this.configService.get<string>(
      'STELLAR_PLATFORM_ADDRESSES',
      '',
    );
    if (platformAddresses) {
      platformAddresses
        .split(',')
        .forEach((addr) => {
          PLATFORM_DISTRIBUTING_ADDRESSES.add(addr.trim());
          this.platformAddresses.add(addr.trim());
        });
    }

    this.logger.log(`Initialized with Horizon URL: ${this.horizonUrl}`);
  }

  /**
   * Verify a transaction hash exists on the Stellar blockchain
   * @param transactionHash - The transaction hash to verify (64 hex characters)
   * @param expectedAmount - Optional expected amount to validate
   * @param expectedAsset - Optional expected asset type to validate
   * @param expectedDestination - Optional expected destination address
   * @param expectedProjectId - Optional expected project ID from memo
   * @returns TransactionVerificationResult with verification status
   */
  async verifyTransaction(
    transactionHash: string,
    expectedAmount?: number,
    expectedAsset?: string,
    expectedDestination?: string,
    expectedProjectId?: string,
  ): Promise<TransactionVerificationResult> {
    const errors: string[] = [];

    // Check cache first
    const cachedResult = this.getCachedResult(transactionHash);
    if (cachedResult) {
      this.logger.log(
        `Using cached verification for transaction ${transactionHash}`,
      );
      return { ...cachedResult, errors };
    }

    try {
      // Validate hash format before making API call
      if (!this.isValidTransactionHash(transactionHash)) {
        const errorMsg = 'Invalid transaction hash format';
        errors.push(errorMsg);
        return {
          isValid: false,
          error: errorMsg,
          errors,
        };
      }

      const response = await fetch(
        `${this.horizonUrl}/transactions/${transactionHash}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        if (response.status === 404) {
          const errorMsg = 'Transaction not found on the Stellar blockchain';
          errors.push(errorMsg);
          this.logger.warn(
            `Transaction ${transactionHash} not found on blockchain`,
          );
          return {
            isValid: false,
            error: errorMsg,
            errors,
          };
        }

        const errorMsg = `Horizon API returned ${response.status}`;
        errors.push(errorMsg);
        this.logger.error(
          `Horizon API error: ${response.status} ${response.statusText}`,
        );
        return {
          isValid: false,
          error: errorMsg,
          errors,
        };
      }

      const transaction: StellarTransaction = await response.json();

      // Verify transaction has successful result
      if (!this.isSuccessfulTransaction(transaction)) {
        const errorMsg = 'Transaction did not execute successfully on the blockchain';
        errors.push(errorMsg);
        this.logger.warn(
          `Transaction ${transactionHash} did not execute successfully`,
        );
        return {
          isValid: false,
          error: errorMsg,
          errors,
        };
      }

      // Parse transaction operations for detailed verification
      const parsedDetails =
        await this.parseTransactionOperations(transactionHash);
      if (!parsedDetails) {
        const errorMsg = 'Failed to parse transaction operations';
        errors.push(errorMsg);
        return {
          isValid: false,
          error: errorMsg,
          errors,
        };
      }

      // Extract memo (project ID)
      const projectId = this.extractProjectIdFromMemo(transaction.memo);

      // Get transaction timestamp
      const timestamp = new Date(transaction.created_at);

      // Validate asset type if expected
      if (expectedAsset && parsedDetails.asset) {
        const normalizedExpected = expectedAsset.toUpperCase();
        const normalizedActual = parsedDetails.asset.toUpperCase();

        if (normalizedExpected !== normalizedActual) {
          const errorMsg = `Asset type mismatch: expected ${normalizedExpected}, got ${normalizedActual}`;
          errors.push(errorMsg);
          this.logger.warn(
            `Asset mismatch: expected ${normalizedExpected}, got ${normalizedActual}`,
          );
          return {
            isValid: false,
            error: errorMsg,
            errors,
          };
        }
      }

      // Validate amount if expected
      if (expectedAmount !== undefined && parsedDetails.amount !== undefined) {
        const tolerance = 0.000001; // Allow for floating point precision
        const amountDiff = Math.abs(parsedDetails.amount - expectedAmount);

        if (amountDiff > tolerance) {
          const errorMsg = `Amount mismatch: expected ${expectedAmount}, got ${parsedDetails.amount}`;
          errors.push(errorMsg);
          this.logger.warn(
            `Amount mismatch: expected ${expectedAmount}, got ${parsedDetails.amount}`,
          );
          return {
            isValid: false,
            error: errorMsg,
            errors,
          };
        }
      }

      // Validate destination if expected
      if (expectedDestination && parsedDetails.destinationAccount) {
        if (
          expectedDestination.toLowerCase() !==
          parsedDetails.destinationAccount.toLowerCase()
        ) {
          const errorMsg = `Destination address mismatch`;
          errors.push(errorMsg);
          this.logger.warn(
            `Destination mismatch: expected ${expectedDestination}, got ${parsedDetails.destinationAccount}`,
          );
          return {
            isValid: false,
            error: errorMsg,
            errors,
          };
        }
      }

      // Validate platform destination (check if payment goes to platform wallet)
      if (
        parsedDetails.destinationAccount &&
        !this.isPlatformAddress(parsedDetails.destinationAccount)
      ) {
        const errorMsg = 'Transaction destination is not a platform wallet';
        errors.push(errorMsg);
        this.logger.warn(
          `Transaction sent to non-platform address: ${parsedDetails.destinationAccount}`,
        );
        return {
          isValid: false,
          error: errorMsg,
          errors,
        };
      }

      // Validate project ID from memo if expected
      if (expectedProjectId && projectId) {
        if (projectId !== expectedProjectId) {
          const errorMsg = `Project ID mismatch: expected ${expectedProjectId}, got ${projectId}`;
          errors.push(errorMsg);
          this.logger.warn(
            `Project ID mismatch: expected ${expectedProjectId}, got ${projectId}`,
          );
          return {
            isValid: false,
            error: errorMsg,
            errors,
          };
        }
      }

      const result: TransactionVerificationResult = {
        isValid: true,
        transaction,
        amount: parsedDetails.amount,
        asset: parsedDetails.asset,
        sourceAccount: parsedDetails.sourceAccount,
        destinationAccount: parsedDetails.destinationAccount,
        projectId,
        timestamp,
        errors: [],
      };

      // Cache the result
      this.cacheResult(transactionHash, result);

      this.logger.log(`Transaction ${transactionHash} verified successfully`);
      return result;
    } catch (error) {
      const errorMsg = 'Failed to verify transaction on blockchain';
      errors.push(errorMsg);
      this.logger.error(
        `Error verifying transaction: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        isValid: false,
        error: errorMsg,
        errors,
      };
    }
  }

  /**
   * Parse transaction operations to extract payment details
   */
  private async parseTransactionOperations(transactionHash: string): Promise<{
    amount?: number;
    asset?: string;
    sourceAccount?: string;
    destinationAccount?: string;
  } | null> {
    try {
      // Use Horizon API to get operations for this transaction
      const response = await fetch(
        `${this.horizonUrl}/transactions/${transactionHash}/operations`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      const operations = data._embedded?.records || [];

      // Find payment operations
      for (const op of operations) {
        if (op.type === 'payment' || op.type_i === 1) {
          // Determine asset type
          let asset = 'XLM'; // Default to native asset
          if (op.asset_type === 'native') {
            asset = 'XLM';
          } else if (op.asset_code) {
            asset = op.asset_code.toUpperCase();
          }

          return {
            amount: parseFloat(op.amount),
            asset,
            sourceAccount: op.from,
            destinationAccount: op.to,
          };
        }
      }

      return null;
    } catch (error) {
      this.logger.error('Error parsing transaction operations:', error);
      return null;
    }
  }

  /**
   * Check if asset type is supported
   */
  isSupportedAsset(asset: string): boolean {
    return SUPPORTED_ASSETS.includes(asset.toUpperCase());
  }

  /**
   * Get supported asset types
   */
  getSupportedAssets(): string[] {
    return [...SUPPORTED_ASSETS];
  }

  /**
   * Extract project ID from transaction memo
   * Expected format: "PROJECT_ID" or "donation:PROJECT_ID"
   */
  private extractProjectIdFromMemo(memo?: string): string | undefined {
    if (!memo) return undefined;

    // Try to extract project ID from memo
    const patterns = [
      /^donation:(.+)$/,  // Format: donation:PROJECT_ID
      /^(.+)$/,            // Format: PROJECT_ID
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

    return undefined;
  }

  /**
   * Check if address belongs to platform
   */
  private isPlatformAddress(address: string): boolean {
    return this.platformAddresses.has(address);
  }

  /**
   * Verify that a transaction is a payment to a specific destination
   */
  async verifyPaymentToDestination(
    transactionHash: string,
    destinationAddress: string,
  ): Promise<TransactionVerificationResult> {
    const result = await this.verifyTransaction(transactionHash);

    if (!result.isValid) {
      return result;
    }

    if (
      result.destinationAccount?.toLowerCase() !==
      destinationAddress.toLowerCase()
    ) {
      return {
        isValid: false,
        error: `Transaction is not directed to the expected destination`,
      };
    }

    return result;
  }

  /**
   * Clear verification cache
   */
  clearCache(): void {
    verificationCache.clear();
    this.logger.log('Verification cache cleared');
  }

  /**
   * Get cached verification result if available and not expired
   */
  private getCachedResult(
    transactionHash: string,
  ): TransactionVerificationResult | null {
    const cached = verificationCache.get(transactionHash);

    if (cached) {
      const now = Date.now();
      if (now - cached.timestamp < CACHE_TTL_MS) {
        return cached.result;
      }
      // Remove expired cache entry
      verificationCache.delete(transactionHash);
    }

    return null;
  }

  /**
   * Cache verification result
   */
  private cacheResult(
    transactionHash: string,
    result: TransactionVerificationResult,
  ): void {
    verificationCache.set(transactionHash, {
      result,
      timestamp: Date.now(),
    });
  }

  /**
   * Validate transaction hash format
   * Stellar transaction hashes are 64 hexadecimal characters
   * @param hash - The hash to validate
   * @returns boolean indicating if hash is valid format
   */
  private isValidTransactionHash(hash: string): boolean {
    const transactionHashRegex = /^[a-f0-9]{64}$/i;
    return transactionHashRegex.test(hash);
  }

  /**
   * Check if transaction executed successfully
   * A successful transaction should have result_xdr that indicates success
   * @param transaction - The transaction object from Horizon API
   * @returns boolean indicating if transaction was successful
   */
  private isSuccessfulTransaction(transaction: StellarTransaction): boolean {
    try {
      // Check if result_meta_xdr exists (indicates transaction was processed)
      if (!transaction.result_meta_xdr || !transaction.tx) {
        return false;
      }

      // Transaction exists and was processed successfully
      return true;
    } catch (error) {
      this.logger.error('Error checking transaction success:', error);
      return false;
    }
  }

  /**
   * Get transaction details from blockchain
   * @param transactionHash - The transaction hash to retrieve
   * @returns Promise resolving to transaction details or null if not found
   */
  async getTransactionDetails(
    transactionHash: string,
  ): Promise<StellarTransaction | null> {
    try {
      if (!this.isValidTransactionHash(transactionHash)) {
        return null;
      }

      const response = await fetch(
        `${this.horizonUrl}/transactions/${transactionHash}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      this.logger.error('Error fetching transaction details:', error);
      return null;
    }
  }
}
