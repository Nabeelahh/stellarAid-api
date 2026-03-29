import { ApiProperty } from '@nestjs/swagger';

/**
 * Result of transaction verification on Stellar blockchain
 */
export class TransactionVerificationResultDto {
  @ApiProperty({
    example: true,
    description: 'Whether the transaction is valid',
  })
  isValid: boolean;

  @ApiProperty({
    example: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    description: 'Transaction hash being verified',
  })
  transactionHash: string;

  @ApiProperty({
    example: 100,
    description: 'Donation amount',
  })
  amount: string;

  @ApiProperty({
    example: 'XLM',
    description: 'Asset type',
  })
  asset: string;

  @ApiProperty({
    example: 'project-uuid-here',
    description: 'Project ID extracted from memo',
    nullable: true,
  })
  projectId: string | null;

  @ApiProperty({
    example: '2024-01-15T10:30:00Z',
    description: 'Transaction timestamp',
  })
  timestamp: Date;

  @ApiProperty({
    example: [],
    description: 'List of validation errors (empty if valid)',
  })
  errors: string[];
}

/**
 * Internal verification result from service layer
 */
export interface VerificationResult {
  isValid: boolean;
  transactionHash: string;
  amount: string;
  asset: string;
  projectId: string | null;
  timestamp: Date;
  errors: string[];
  donorAddress?: string;
  destinationAddress?: string;
}
