import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as StellarSdk from 'stellar-sdk';

export interface StellarTransactionResult {
  status: 'success' | 'failed' | 'pending';
  amount: string;
  asset: string;
  destinationAddress: string;
  sourceAddress: string;
  ledger: number;
  createdAt: string;
}

@Injectable()
export class StellarTransactionService {
  private readonly logger = new Logger(StellarTransactionService.name);
  private readonly server: StellarSdk.Horizon.Server;

  constructor(private readonly configService: ConfigService) {
    const horizonUrl =
      this.configService.get<string>('STELLAR_HORIZON_URL') ||
      'https://horizon-testnet.stellar.org';
    this.server = new StellarSdk.Horizon.Server(horizonUrl);
  }

  async fetchTransaction(
    transactionHash: string,
  ): Promise<StellarTransactionResult> {
    try {
      const tx = await this.server.transactions().transaction(transactionHash).call();

      if (!tx.successful) {
        return this.buildResult('failed', tx);
      }

      // Parse operations to extract payment details
      const operations = await this.server
        .operations()
        .forTransaction(transactionHash)
        .call();

      const paymentOp = operations.records.find(
        (op) => op.type === 'payment',
      ) as StellarSdk.Horizon.ServerApi.PaymentOperationRecord | undefined;

      if (!paymentOp) {
        this.logger.warn(
          `No payment operation found in transaction ${transactionHash}`,
        );
        return this.buildResult('failed', tx);
      }

      const asset =
        paymentOp.asset_type === 'native'
          ? 'XLM'
          : `${paymentOp.asset_code}:${paymentOp.asset_issuer}`;

      return {
        status: 'success',
        amount: paymentOp.amount,
        asset,
        destinationAddress: paymentOp.to,
        sourceAddress: paymentOp.from,
        ledger: tx.ledger_attr,
        createdAt: tx.created_at,
      };
    } catch (error: any) {
      // Horizon returns 404 for transactions not yet on ledger
      if (error?.response?.status === 404) {
        this.logger.warn(
          `Transaction ${transactionHash} not found on ledger — treating as pending`,
        );
        return {
          status: 'pending',
          amount: '0',
          asset: '',
          destinationAddress: '',
          sourceAddress: '',
          ledger: 0,
          createdAt: '',
        };
      }

      this.logger.error(
        `Error fetching transaction ${transactionHash}: ${error.message}`,
      );
      throw error;
    }
  }

  private buildResult(
    status: StellarTransactionResult['status'],
    tx: any,
  ): StellarTransactionResult {
    return {
      status,
      amount: '0',
      asset: '',
      destinationAddress: '',
      sourceAddress: '',
      ledger: tx?.ledger_attr ?? 0,
      createdAt: tx?.created_at ?? '',
    };
  }
}