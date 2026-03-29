import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { Public } from '../common/decorators/public.decorator';
import { StellarBlockchainService } from '../common/services/stellar-blockchain.service';
import { DonationRecordingService } from './services/donation-recording.service';
import { TransactionVerificationResultDto } from './dto/transaction-verification.dto';

interface VerifyTransactionDto {
  transactionHash: string;
  expectedAmount?: number;
  expectedAsset?: string;
  expectedProjectId?: string;
}

interface RecordDonationDto {
  transactionHash: string;
  projectId: string;
  donorId?: string;
  isAnonymous?: boolean;
}

@ApiTags('Donations')
@Controller('donations/verification')
export class DonationVerificationController {
  private readonly logger = new Logger(DonationVerificationController.name);

  constructor(
    private readonly stellarBlockchainService: StellarBlockchainService,
    private readonly donationRecordingService: DonationRecordingService,
  ) {}

  @Public()
  @Get('verify/:transactionHash')
  @ApiOperation({ 
    summary: 'Verify a single transaction on the blockchain',
    description: 'Fetches and verifies a transaction from Stellar Horizon by hash'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Transaction verification result',
    type: TransactionVerificationResultDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid transaction hash' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async verifyTransaction(
    @Param('transactionHash') transactionHash: string,
  ) {
    const result = await this.stellarBlockchainService.verifyTransaction(transactionHash);
    
    // Convert to DTO format
    return {
      isValid: result.isValid,
      transactionHash,
      amount: result.amount?.toString() || '0',
      asset: result.asset || 'XLM',
      projectId: result.projectId || null,
      timestamp: result.timestamp || new Date(),
      errors: result.errors || (result.error ? [result.error] : []),
    };
  }

  @Post('verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Verify transaction with additional validation',
    description: 'Verifies a transaction with optional expected values for amount, asset, and project ID'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Transaction verification result',
    type: TransactionVerificationResultDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid data or verification failed' })
  async verifyTransactionWithValidation(
    @Body() verifyTransactionDto: VerifyTransactionDto,
  ) {
    const { transactionHash, expectedAmount, expectedAsset, expectedProjectId } = verifyTransactionDto;
    
    const result = await this.stellarBlockchainService.verifyTransaction(
      transactionHash,
      expectedAmount,
      expectedAsset,
      undefined, // destination
      expectedProjectId,
    );
    
    // Convert to DTO format
    return {
      isValid: result.isValid,
      transactionHash,
      amount: result.amount?.toString() || '0',
      asset: result.asset || 'XLM',
      projectId: result.projectId || null,
      timestamp: result.timestamp || new Date(),
      errors: result.errors || (result.error ? [result.error] : []),
    };
  }

  @Post('record')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ 
    summary: 'Record a verified donation',
    description: 'Records a verified donation in the database after blockchain verification'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Donation recorded successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid data or duplicate transaction' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async recordVerifiedDonation(
    @Body() recordDonationDto: RecordDonationDto,
  ) {
    const { transactionHash, projectId, donorId, isAnonymous } = recordDonationDto;
    
    // First verify the transaction
    const verificationResult = await this.stellarBlockchainService.verifyTransaction(
      transactionHash,
      undefined,
      undefined,
      undefined,
      projectId,
    );
    
    if (!verificationResult.isValid) {
      return {
        success: false,
        message: 'Transaction verification failed',
        errors: verificationResult.errors || (verificationResult.error ? [verificationResult.error] : []),
      };
    }
    
    // Record the verified donation
    const result = await this.donationRecordingService.recordVerifiedDonation(
      {
        isValid: verificationResult.isValid,
        transactionHash,
        amount: verificationResult.amount?.toString() || '0',
        asset: verificationResult.asset || 'XLM',
        projectId,
        timestamp: verificationResult.timestamp || new Date(),
        errors: [],
        donorAddress: verificationResult.sourceAccount,
        destinationAddress: verificationResult.destinationAccount,
      },
      donorId,
      isAnonymous,
    );
    
    return {
      success: result.success,
      donationId: result.donationId,
      message: result.message,
      duplicate: result.duplicate,
    };
  }

  @Public()
  @Get('check-duplicate/:transactionHash')
  @ApiOperation({ 
    summary: 'Check if transaction hash already exists',
    description: 'Checks if a donation has already been recorded for this transaction hash'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Duplicate check result',
  })
  async checkDuplicate(
    @Param('transactionHash') transactionHash: string,
  ) {
    const isDuplicate = await this.donationRecordingService.isDuplicateTransaction(transactionHash);
    
    return {
      transactionHash,
      isDuplicate,
      exists: isDuplicate,
    };
  }

  @Public()
  @Get('transaction/:transactionHash')
  @ApiOperation({ 
    summary: 'Get donation by transaction hash',
    description: 'Retrieves donation details by Stellar transaction hash'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Donation details',
  })
  @ApiResponse({ status: 404, description: 'Donation not found' })
  async getDonationByTransactionHash(
    @Param('transactionHash') transactionHash: string,
  ) {
    const donation = await this.donationRecordingService.getDonationByTransactionHash(transactionHash);
    
    if (!donation) {
      return {
        success: false,
        message: 'Donation not found',
        transactionHash,
      };
    }
    
    return {
      success: true,
      donation,
    };
  }
}
