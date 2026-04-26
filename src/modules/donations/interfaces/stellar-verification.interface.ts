export interface StellarAsset {
  type: 'native' | 'credit_alphanum4' | 'credit_alphanum12';
  code?: string;
  issuer?: string;
}

export interface TransactionDetails {
  transactionHash: string;
  amount: string;
  asset: StellarAsset;
  recipient: string;
  sender?: string;
  memo?: string;
  timestamp?: number;
}

export interface VerificationResult {
  isValid: boolean;
  transactionDetails: TransactionDetails;
  errors: string[];
  warnings: string[];
  verifiedAt: Date;
  ledgerSequence?: number;
}

export interface StellarVerificationOptions {
  expectedRecipient?: string;
  expectedAmount?: string;
  expectedAsset?: StellarAsset;
  allowOverpayment?: boolean;
  tolerancePercentage?: number;
}

export interface CachedVerification {
  result: VerificationResult;
  cachedAt: Date;
  expiresAt: Date;
}
