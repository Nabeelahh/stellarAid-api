import { IsString, IsOptional, IsNumber, IsBoolean, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { StellarAsset } from '../interfaces/stellar-verification.interface';

export class VerifyTransactionDto {
  @IsString()
  transactionHash: string;

  @IsOptional()
  @IsString()
  expectedRecipient?: string;

  @IsOptional()
  @IsString()
  expectedAmount?: string;

  @IsOptional()
  asset?: StellarAsset;

  @IsOptional()
  @IsBoolean()
  allowOverpayment?: boolean = false;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  tolerancePercentage?: number = 0;

  @IsOptional()
  @IsString()
  memo?: string;
}

export class StellarAssetDto implements StellarAsset {
  @IsString()
  type: 'native' | 'credit_alphanum4' | 'credit_alphanum12';

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  issuer?: string;
}
