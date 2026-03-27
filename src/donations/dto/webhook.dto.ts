import { IsNotEmpty, IsNumber, IsString, IsOptional, IsEnum, IsDateString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Webhook payload from payment gateway/Stellar callback
 */
export class WebhookDonationDto {
  @ApiProperty({
    example: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    description: 'Stellar blockchain transaction hash',
  })
  @IsNotEmpty()
  @IsString()
  transactionHash: string;

  @ApiProperty({
    example: 'project-uuid',
    description: 'Project ID to donate to',
  })
  @IsNotEmpty()
  @IsString()
  projectId: string;

  @ApiProperty({ example: 100, description: 'Donation amount' })
  @IsNotEmpty()
  @IsNumber()
  @Min(0.0000001)
  amount: number;

  @ApiProperty({
    example: 'XLM',
    description: 'Asset type for donation',
    enum: ['XLM', 'USDC', 'NGNT'],
    default: 'XLM',
  })
  @IsOptional()
  @IsEnum(['XLM', 'USDC', 'NGNT'])
  assetType?: string = 'XLM';

  @ApiProperty({
    example: 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ',
    description: 'Donor Stellar public key (source of the transaction)',
  })
  @IsOptional()
  @IsString()
  donorAddress?: string;

  @ApiProperty({
    example: 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ',
    description: 'Recipient Stellar public key',
  })
  @IsOptional()
  @IsString()
  recipientAddress?: string;

  @ApiProperty({
    example: false,
    description: 'Whether donation is anonymous',
    default: false,
  })
  @IsOptional()
  isAnonymous?: boolean = false;

  @ApiProperty({
    example: 'donor@example.com',
    description: 'Donor email (optional, for notifications)',
  })
  @IsOptional()
  @IsString()
  donorEmail?: string;

  @ApiProperty({
    example: '2024-01-15T10:30:00Z',
    description: 'Timestamp of the transaction',
  })
  @IsOptional()
  @IsDateString()
  timestamp?: string;

  @ApiProperty({
    example: 'webhook_123456',
    description: 'Unique webhook ID for deduplication',
  })
  @IsOptional()
  @IsString()
  webhookId?: string;

  @ApiProperty({
    example: 'testnet',
    description: 'Network the transaction was on',
    enum: ['testnet', 'public'],
    default: 'testnet',
  })
  @IsOptional()
  @IsEnum(['testnet', 'public'])
  network?: string = 'testnet';
}

/**
 * Response for webhook endpoint
 */
export class WebhookResponseDto {
  @ApiProperty({ example: true, description: 'Whether the webhook was processed successfully' })
  success: boolean;

  @ApiProperty({ example: 'Donation processed successfully', description: 'Message describing the result' })
  message: string;

  @ApiProperty({
    example: 'uuid-of-donation',
    description: 'ID of the created donation (if successful)',
    nullable: true,
  })
  donationId?: string;

  @ApiProperty({
    example: false,
    description: 'Whether this was a duplicate webhook',
  })
  duplicate: boolean;
}
