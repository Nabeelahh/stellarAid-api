import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Donation } from '../entities/donation.entity';
import { Project } from '../../projects/entities/project.entity';
import { User } from '../../users/entities/user.entity';
import { MailService } from '../../mail/mail.service';
import { VerificationResult } from '../dto/transaction-verification.dto';

/**
 * Result of recording a verified donation
 */
interface RecordDonationResult {
  success: boolean;
  donationId?: string;
  message: string;
  duplicate: boolean;
}

@Injectable()
export class DonationRecordingService {
  private readonly logger = new Logger(DonationRecordingService.name);

  constructor(
    @InjectRepository(Donation)
    private donationsRepository: Repository<Donation>,
    @InjectRepository(Project)
    private projectRepository: Repository<Project>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private mailService: MailService,
  ) {}

  /**
   * Record a verified donation in the database
   * Performs atomic operations to ensure data consistency
   * 
   * @param verificationResult - Verified transaction data from blockchain
   * @param donorId - Optional donor user ID (if authenticated)
   * @param isAnonymous - Whether donation should be anonymous
   * @returns Result of the recording operation
   */
  async recordVerifiedDonation(
    verificationResult: VerificationResult,
    donorId?: string,
    isAnonymous: boolean = false,
  ): Promise<RecordDonationResult> {
    const {
      transactionHash,
      amount,
      asset,
      projectId,
      timestamp,
      donorAddress,
    } = verificationResult;

    try {
      // 1. Check for duplicate transaction hash
      const existingDonation = await this.donationsRepository.findOne({
        where: { transactionHash },
      });

      if (existingDonation) {
        this.logger.log(`Duplicate donation detected: ${transactionHash}`);
        return {
          success: true,
          donationId: existingDonation.id,
          message: 'Donation already exists with this transaction hash',
          duplicate: true,
        };
      }

      // 2. Verify project exists
      const project = await this.projectRepository.findOne({
        where: { id: projectId },
      });

      if (!project) {
        throw new NotFoundException(`Project with ID ${projectId} not found`);
      }

      // 3. Create donation query runner for atomic transaction
      const queryRunner = this.donationsRepository.manager.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        // 4. Create donation record
        const donation = queryRunner.manager.create(Donation, {
          projectId,
          donorId: isAnonymous ? null : donorId || null,
          amount: parseFloat(amount),
          assetType: asset,
          transactionHash,
          isAnonymous,
        });

        const savedDonation = await queryRunner.manager.save(donation);

        // 5. Update project funds_raised and donationCount atomically
        await queryRunner.manager.update(
          Project,
          { id: projectId },
          {
            fundsRaised: () =>
              `CAST(fundsRaised + ${Number(amount)} AS decimal(18,7))`,
            donationCount: () => 'donationCount + 1',
          },
        );

        // 6. Retrieve updated project for progress calculation
        const updatedProject = await queryRunner.manager.findOne(Project, {
          where: { id: projectId },
        });

        if (updatedProject) {
          // Calculate progress percentage
          const goalAmount = Number(updatedProject.goalAmount) || 1;
          const fundsRaised = Number(updatedProject.fundsRaised) || 0;
          const progress = Math.min((fundsRaised / goalAmount) * 100, 100);

          // Update progress
          await queryRunner.manager.update(
            Project,
            { id: projectId },
            {
              progress: Math.round(progress * 100) / 100,
            },
          );
        }

        // Commit transaction
        await queryRunner.commitTransaction();

        this.logger.log(
          `Successfully recorded donation: ${amount} ${asset} to project ${projectId} (TX: ${transactionHash})`,
        );

        // 7. Send confirmation email (outside transaction)
        if (!isAnonymous && donorId) {
          this.sendDonationConfirmationEmail(
            donorId,
            savedDonation,
            project,
          ).catch((error) => {
            this.logger.error(
              'Error sending donation confirmation email:',
              error,
            );
            // Don't throw - email failures shouldn't affect donation success
          });
        }

        // 8. Emit real-time update event (placeholder for WebSocket integration)
        this.emitDonationUpdateEvent(savedDonation);

        return {
          success: true,
          donationId: savedDonation.id,
          message: 'Donation recorded successfully',
          duplicate: false,
        };
      } catch (error) {
        // Rollback on error
        await queryRunner.rollbackTransaction();
        throw error;
      } finally {
        // Release query runner
        await queryRunner.release();
      }
    } catch (error) {
      // Handle database-specific errors
      if (error.code === '23505') {
        // PostgreSQL unique violation - concurrent duplicate
        const existingDonation = await this.donationsRepository.findOne({
          where: { transactionHash },
        });

        if (existingDonation) {
          return {
            success: true,
            donationId: existingDonation.id,
            message: 'Donation already exists with this transaction hash',
            duplicate: true,
          };
        }
      }

      if (error.code === '23503') {
        // PostgreSQL foreign key violation
        throw new BadRequestException('Invalid project ID');
      }

      this.logger.error('Error recording donation:', error);
      throw new BadRequestException('Failed to record donation');
    }
  }

  /**
   * Check if a transaction hash has already been processed
   */
  async isDuplicateTransaction(
    transactionHash: string,
  ): Promise<boolean> {
    const existingDonation = await this.donationsRepository.findOne({
      where: { transactionHash },
    });

    return !!existingDonation;
  }

  /**
   * Get donation by transaction hash
   */
  async getDonationByTransactionHash(
    transactionHash: string,
  ): Promise<Donation | null> {
    return await this.donationsRepository.findOne({
      where: { transactionHash },
      relations: ['project', 'donor'],
    });
  }

  /**
   * Send donation confirmation email to donor
   */
  private async sendDonationConfirmationEmail(
    donorId: string,
    donation: Donation,
    project: Project,
  ): Promise<void> {
    try {
      const donor = await this.userRepository.findOne({
        where: { id: donorId },
      });

      if (!donor || !donor.email) {
        this.logger.warn(
          `Unable to send confirmation email - donor ${donorId} not found or has no email`,
        );
        return;
      }

      await this.mailService.sendDonationConfirmationEmail(
        donor.email,
        donor.firstName || 'Donor',
        {
          projectName: project.title,
          amount: Number(donation.amount),
          assetType: donation.assetType,
          transactionHash: donation.transactionHash || '',
          projectId: project.id,
        },
      );

      this.logger.log(
        `Sent confirmation email to donor ${donorId} for donation ${donation.id}`,
      );
    } catch (error) {
      this.logger.error('Error in sendDonationConfirmationEmail:', error);
      // Silently fail - don't interrupt the donation process
    }
  }

  /**
   * Emit real-time update event for donation
   * Placeholder for WebSocket/gateway integration
   */
  private emitDonationUpdateEvent(donation: Donation): void {
    // TODO: Integrate with WebSocket gateway for real-time updates
    // Example:
    // this.websocketGateway.server.emit('donation-created', {
    //   donationId: donation.id,
    //   projectId: donation.projectId,
    //   amount: donation.amount,
    //   assetType: donation.assetType,
    //   timestamp: donation.createdAt,
    // });

    this.logger.debug(
      `Real-time update emitted for donation ${donation.id} to project ${donation.projectId}`,
    );
  }
}
