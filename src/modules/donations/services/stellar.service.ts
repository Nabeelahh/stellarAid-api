import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Horizon, Server, Transaction, Asset, TransactionBuilder } from '@stellar/stellar-sdk';
import {
  TransactionDetails,
  VerificationResult,
  StellarVerificationOptions,
  CachedVerification,
  StellarAsset,
} from '../interfaces/stellar-verification.interface';

@Injectable()
export class StellarService {
  private readonly logger = new Logger(StellarService.name);
  private readonly server: Server;
  private readonly verificationCache = new Map<string, CachedVerification>();
  private readonly cacheExpiryMs = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly configService: ConfigService) {
    const horizonUrl = this.configService.get<string>('STELLAR_HORIZON_URL') || 'https://horizon-testnet.stellar.org';
    this.server = new Server(horizonUrl);
  }

  async verifyTransaction(
    transactionHash: string,
    options: StellarVerificationOptions = {},
  ): Promise<VerificationResult> {
    try {
      // Check cache first
      const cached = this.getCachedResult(transactionHash);
      if (cached) {
        this.logger.log(`Returning cached result for transaction ${transactionHash}`);
        return cached.result;
      }

      // Fetch transaction from Stellar network
      const transactionDetails = await this.fetchTransactionDetails(transactionHash);
      
      // Validate transaction
      const validationResult = this.validateTransaction(transactionDetails, options);
      
      const result: VerificationResult = {
        isValid: validationResult.isValid,
        transactionDetails,
        errors: validationResult.errors,
        warnings: validationResult.warnings,
        verifiedAt: new Date(),
        ledgerSequence: transactionDetails.ledgerSequence,
      };

      // Cache the result
      this.cacheVerificationResult(transactionHash, result);

      return result;
    } catch (error) {
      this.logger.error(`Failed to verify transaction ${transactionHash}:`, error);
      
      if (error instanceof Horizon.Error) {
        throw new BadRequestException(`Stellar network error: ${error.message}`);
      }
      
      throw new BadRequestException(`Transaction verification failed: ${error.message}`);
    }
  }

  private async fetchTransactionDetails(transactionHash: string): Promise<TransactionDetails & { ledgerSequence: number }> {
    try {
      const transactionResponse = await this.server.transactions()
        .transaction(transactionHash)
        .call();

      if (!transactionResponse) {
        throw new NotFoundException(`Transaction ${transactionHash} not found`);
      }

      // Parse transaction to extract payment details
      const transaction = TransactionBuilder.fromXDR(transactionResponse.envelope_xdr, 'base64');
      const operations = transaction.operations;

      // Find payment operation
      const paymentOp = operations.find(op => op.type === 'payment');
      if (!paymentOp) {
        throw new BadRequestException('Transaction does not contain a payment operation');
      }

      const payment = paymentOp as any; // Payment operation
      const asset = this.parseAsset(payment.asset);

      return {
        transactionHash,
        amount: payment.amount,
        asset,
        recipient: payment.destination,
        sender: transactionResponse.source_account,
        memo: transactionResponse.memo ? transactionResponse.memo.toString() : undefined,
        timestamp: new Date(transactionResponse.created_at).getTime(),
        ledgerSequence: transactionResponse.ledger,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch transaction details for ${transactionHash}:`, error);
      throw error;
    }
  }

  private parseAsset(stellarAsset: Asset): StellarAsset {
    if (stellarAsset.isNative()) {
      return { type: 'native' };
    }

    return {
      type: stellarAsset.assetType as 'credit_alphanum4' | 'credit_alphanum12',
      code: stellarAsset.code,
      issuer: stellarAsset.issuer,
    };
  }

  private validateTransaction(
    details: TransactionDetails & { ledgerSequence: number },
    options: StellarVerificationOptions,
  ): { isValid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate recipient if specified
    if (options.expectedRecipient && details.recipient !== options.expectedRecipient) {
      errors.push(`Recipient mismatch. Expected: ${options.expectedRecipient}, Got: ${details.recipient}`);
    }

    // Validate amount if specified
    if (options.expectedAmount) {
      const expectedAmount = parseFloat(options.expectedAmount);
      const actualAmount = parseFloat(details.amount);

      if (options.allowOverpayment) {
        if (actualAmount < expectedAmount) {
          errors.push(`Insufficient amount. Expected: ${expectedAmount}, Got: ${actualAmount}`);
        } else if (actualAmount > expectedAmount) {
          warnings.push(`Overpayment detected. Expected: ${expectedAmount}, Got: ${actualAmount}`);
        }
      } else {
        const tolerance = options.tolerancePercentage || 0;
        const toleranceAmount = expectedAmount * (tolerance / 100);
        const minAmount = expectedAmount - toleranceAmount;
        const maxAmount = expectedAmount + toleranceAmount;

        if (actualAmount < minAmount || actualAmount > maxAmount) {
          errors.push(`Amount outside tolerance. Expected: ${expectedAmount} ±${tolerance}%, Got: ${actualAmount}`);
        }
      }
    }

    // Validate asset if specified
    if (options.expectedAsset) {
      if (details.asset.type !== options.expectedAsset.type) {
        errors.push(`Asset type mismatch. Expected: ${options.expectedAsset.type}, Got: ${details.asset.type}`);
      }

      if (options.expectedAsset.code && details.asset.code !== options.expectedAsset.code) {
        errors.push(`Asset code mismatch. Expected: ${options.expectedAsset.code}, Got: ${details.asset.code}`);
      }

      if (options.expectedAsset.issuer && details.asset.issuer !== options.expectedAsset.issuer) {
        errors.push(`Asset issuer mismatch. Expected: ${options.expectedAsset.issuer}, Got: ${details.asset.issuer}`);
      }
    }

    // Validate supported asset types
    if (!this.isSupportedAsset(details.asset)) {
      warnings.push(`Asset type ${details.asset.type} with code ${details.asset.code} may not be supported`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private isSupportedAsset(asset: StellarAsset): boolean {
    if (asset.type === 'native') {
      return true; // XLM
    }

    const supportedAssets = ['USDC', 'NGNT'];
    return supportedAssets.includes(asset.code || '');
  }

  private getCachedResult(transactionHash: string): CachedVerification | null {
    const cached = this.verificationCache.get(transactionHash);
    if (!cached) {
      return null;
    }

    if (new Date() > cached.expiresAt) {
      this.verificationCache.delete(transactionHash);
      return null;
    }

    return cached;
  }

  private cacheVerificationResult(transactionHash: string, result: VerificationResult): void {
    const cached: CachedVerification = {
      result,
      cachedAt: new Date(),
      expiresAt: new Date(Date.now() + this.cacheExpiryMs),
    };

    this.verificationCache.set(transactionHash, cached);
  }

  // Helper method to get asset information
  async getAssetInfo(assetCode: string, issuer?: string): Promise<Asset | null> {
    try {
      if (assetCode === 'XLM') {
        return Asset.native();
      }

      if (!issuer) {
        throw new BadRequestException('Issuer is required for non-native assets');
      }

      // Verify asset exists on the network
      const asset = new Asset(assetCode, issuer);
      await this.server.assets()
        .forCode(assetCode)
        .forIssuer(issuer)
        .call();

      return asset;
    } catch (error) {
      this.logger.error(`Failed to get asset info for ${assetCode}:`, error);
      return null;
    }
  }

  // Method to check if an account exists
  async accountExists(accountId: string): Promise<boolean> {
    try {
      await this.server.accounts().accountId(accountId).call();
      return true;
    } catch (error) {
      if (error instanceof Horizon.Error && error.response?.status === 404) {
        return false;
      }
      throw error;
    }
  }
}
