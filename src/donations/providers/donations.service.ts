import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Donation } from '../entities/donation.entity';
import { Project } from '../../projects/entities/project.entity';
import { User } from '../../users/entities/user.entity';
import { CreateDonationDto } from '../dto/create-donation.dto';
import { UpdateDonationDto } from '../dto/update-donation.dto';
import { DonationResponseDto } from '../dto/donation-response.dto';
import { WebhookDonationDto, WebhookResponseDto } from '../dto/webhook.dto';
import {
  ProjectDonationsResponseDto,
  ProjectDonationItemDto,
  ProjectDonationsStatsDto,
} from '../dto/project-donations-response.dto';
import {
  UserDonationHistoryResponseDto,
  UserDonationItemDto,
  UserDonationSummaryDto,
} from '../dto/user-donation-history-response.dto';
import {
  LeaderboardResponseDto,
  LeaderboardDonorDto,
} from '../dto/leaderboard-response.dto';
import { LeaderboardScope } from '../dto/leaderboard-query.dto';
import { StellarBlockchainService } from '../../common/services/stellar-blockchain.service';
import { MailService } from '../../mail/mail.service';

// In-memory store for webhook deduplication (in production, use Redis)
const processedWebhooks = new Map<
  string,
  { donationId: string; processedAt: Date }
>();
const WEBHOOK_DEDUP_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// In-memory cache for leaderboard
interface LeaderboardCacheEntry {
  data: LeaderboardResponseDto;
  timestamp: number;
}
const leaderboardCache = new Map<string, LeaderboardCacheEntry>();
const LEADERBOARD_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Asset conversion rates (simplified - in production, use a price oracle)
const ASSET_CONVERSION_RATES: Record<string, number> = {
  XLM: 0.12, // Example rate: 1 XLM = $0.12 USD
  USDC: 1.0, // 1 USDC = $1.00 USD
  USD: 1.0,
};

@Injectable()
export class DonationsService {
  private readonly logger = new Logger(DonationsService.name);
  constructor(
    @InjectRepository(Donation)
    private donationsRepository: Repository<Donation>,
    @InjectRepository(Project)
    private projectRepository: Repository<Project>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private stellarBlockchainService: StellarBlockchainService,
    private mailService: MailService,
  ) {}

  async create(
    createDonationDto: CreateDonationDto,
    donorId?: string,
  ): Promise<DonationResponseDto> {
    const {
      projectId,
      transactionHash,
      amount,
      assetType = 'XLM',
      isAnonymous = false,
    } = createDonationDto;

    try {
      // 1. Check if project exists
      const project = await this.projectRepository.findOne({
        where: { id: projectId },
      });

      if (!project) {
        throw new NotFoundException(`Project with ID ${projectId} not found`);
      }

      // 2. Check for duplicate transaction hash
      const existingDonation = await this.donationsRepository.findOne({
        where: { transactionHash },
      });

      if (existingDonation) {
        throw new ConflictException(
          'A donation with this transaction hash already exists',
        );
      }

      // 3. Verify transaction on Stellar blockchain
      const verificationResult =
        await this.stellarBlockchainService.verifyTransaction(transactionHash);

      if (!verificationResult.isValid) {
        throw new BadRequestException(
          `Transaction verification failed: ${verificationResult.error || 'Unknown error'}`,
        );
      }

      // 4. Create and save donation
      const donation = this.donationsRepository.create({
        projectId,
        donorId: isAnonymous ? null : donorId || null,
        amount,
        assetType,
        transactionHash,
        isAnonymous,
      });

      const savedDonation = await this.donationsRepository.save(donation);

      // 5. Update project funds_raised and donationCount atomically
      await this.projectRepository.update(
        { id: projectId },
        {
          fundsRaised: () =>
            `CAST(fundsRaised + ${Number(amount)} AS decimal(18,7))`,
          donationCount: () => 'donationCount + 1',
        },
      );

      // 6. Retrieve updated project for progress calculation
      const updatedProject = await this.projectRepository.findOne({
        where: { id: projectId },
      });

      if (updatedProject) {
        // Calculate progress percentage
        const goalAmount = Number(updatedProject.goalAmount) || 1;
        const fundsRaised = Number(updatedProject.fundsRaised) || 0;
        const progress = Math.min((fundsRaised / goalAmount) * 100, 100);

        // Update progress
        await this.projectRepository.update(
          { id: projectId },
          {
            progress: Math.round(progress * 100) / 100,
          },
        );
      }

      // 7. Send confirmation email to donor (if not anonymous)
      if (!isAnonymous && donorId) {
        this.sendDonationConfirmationEmail(
          donorId,
          savedDonation,
          project,
        ).catch((error) => {
          console.error('Error sending donation confirmation email:', error);
          // Don't throw - email failures shouldn't affect the donation success
        });
      }

      return DonationResponseDto.fromEntity(savedDonation);
    } catch (error) {
      // Re-throw known exceptions
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      // Handle database-specific errors
      if (error.code === '23505') {
        // PostgreSQL unique violation
        throw new ConflictException(
          'A donation with this transaction hash already exists',
        );
      }

      if (error.code === '23503') {
        // PostgreSQL foreign key violation
        throw new BadRequestException('Invalid project ID');
      }

      // Log unexpected errors
      console.error('Error creating donation:', error);
      throw new BadRequestException('Failed to create donation');
    }
  }

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
        console.warn(
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
    } catch (error) {
      console.error('Error in sendDonationConfirmationEmail:', error);
      // Silently fail - don't interrupt the donation process
    }
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
  ): Promise<{ data: DonationResponseDto[]; total: number }> {
    const [data, total] = await this.donationsRepository.findAndCount({
      relations: ['project', 'donor'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: data.map((donation) => DonationResponseDto.fromEntity(donation)),
      total,
    };
  }

  async findOne(id: string): Promise<DonationResponseDto> {
    const donation = await this.donationsRepository.findOne({
      where: { id },
      relations: ['project', 'donor'],
    });

    if (!donation) {
      throw new NotFoundException(`Donation with ID ${id} not found`);
    }

    return DonationResponseDto.fromEntity(donation);
  }

  async findByProject(
    projectId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<{ data: DonationResponseDto[]; total: number }> {
    const [data, total] = await this.donationsRepository.findAndCount({
      where: { projectId },
      relations: ['donor'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: data.map((donation) => DonationResponseDto.fromEntity(donation)),
      total,
    };
  }

  async findByDonor(
    donorId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<{ data: DonationResponseDto[]; total: number }> {
    const [data, total] = await this.donationsRepository.findAndCount({
      where: { donorId },
      relations: ['project'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: data.map((donation) => DonationResponseDto.fromEntity(donation)),
      total,
    };
  }

  async findByTransactionHash(
    transactionHash: string,
  ): Promise<DonationResponseDto> {
    const donation = await this.donationsRepository.findOne({
      where: { transactionHash },
      relations: ['project', 'donor'],
    });

    if (!donation) {
      throw new NotFoundException(
        `Donation with transaction hash ${transactionHash} not found`,
      );
    }

    return DonationResponseDto.fromEntity(donation);
  }

  async update(
    id: string,
    updateDonationDto: UpdateDonationDto,
  ): Promise<DonationResponseDto> {
    const donation = await this.findOne(id);

    Object.assign(donation, updateDonationDto);

    try {
      const updatedDonation = await this.donationsRepository.save(donation);
      return DonationResponseDto.fromEntity(updatedDonation);
    } catch (error) {
      if (error.code === '23505') {
        throw new ConflictException(
          'A donation with this transaction hash already exists',
        );
      }
      throw new BadRequestException('Failed to update donation');
    }
  }

  async remove(id: string): Promise<void> {
    const donation = await this.findOne(id);
    await this.donationsRepository.delete(donation.id);
  }

  async getTotalDonationsForProject(projectId: string): Promise<number> {
    const result = await this.donationsRepository
      .createQueryBuilder('donation')
      .select('SUM(donation.amount)', 'total')
      .where('donation.projectId = :projectId', { projectId })
      .getRawOne();

    return parseFloat(result.total) || 0;
  }

  async getDonationCountForProject(projectId: string): Promise<number> {
    return await this.donationsRepository.count({
      where: { projectId },
    });
  }

  async findDonationsByProject(
    projectId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<ProjectDonationsResponseDto> {
    // Fetch paginated donations with donor info
    const [donations, total] = await this.donationsRepository.findAndCount({
      where: { projectId },
      relations: ['donor'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Calculate statistics
    const stats = await this.calculateProjectDonationStats(projectId);

    // Transform donations to DTOs with anonymization
    const donationItems: ProjectDonationItemDto[] = donations.map((donation) =>
      ProjectDonationsResponseDto.fromEntity(donation),
    );

    return {
      data: donationItems,
      total,
      page,
      limit,
      stats,
    };
  }

  private async calculateProjectDonationStats(
    projectId: string,
  ): Promise<ProjectDonationsStatsDto> {
    // Get total donations count and amount
    const totalStats = await this.donationsRepository
      .createQueryBuilder('donation')
      .select('COUNT(donation.id)', 'totalDonations')
      .addSelect('SUM(donation.amount)', 'totalAmount')
      .where('donation.projectId = :projectId', { projectId })
      .getRawOne();

    // Get unique donors count (excluding anonymous donations)
    const uniqueDonorsResult = await this.donationsRepository
      .createQueryBuilder('donation')
      .select('COUNT(DISTINCT donation.donorId)', 'uniqueDonors')
      .where('donation.projectId = :projectId', { projectId })
      .andWhere('donation.isAnonymous = :isAnonymous', { isAnonymous: false })
      .getRawOne();

    const totalDonations = parseInt(totalStats.totalDonations, 10) || 0;
    const totalAmount = parseFloat(totalStats.totalAmount) || 0;
    const uniqueDonors = parseInt(uniqueDonorsResult.uniqueDonors, 10) || 0;

    return {
      totalDonations,
      totalAmount,
      averageDonation: totalDonations > 0 ? totalAmount / totalDonations : 0,
      uniqueDonors,
    };
  }

  async getUserDonationHistory(
    userId: string,
    page: number = 1,
    limit: number = 10,
    startDate?: string,
    endDate?: string,
  ): Promise<UserDonationHistoryResponseDto> {
    // Build query with date filters
    const queryBuilder = this.donationsRepository
      .createQueryBuilder('donation')
      .leftJoinAndSelect('donation.project', 'project')
      .where('donation.donorId = :userId', { userId })
      .orderBy('donation.createdAt', 'DESC');

    // Apply date range filters if provided
    if (startDate) {
      queryBuilder.andWhere('donation.createdAt >= :startDate', {
        startDate: new Date(startDate),
      });
    }

    if (endDate) {
      queryBuilder.andWhere('donation.createdAt <= :endDate', {
        endDate: new Date(endDate),
      });
    }

    // Get total count for pagination
    const total = await queryBuilder.getCount();

    // Get paginated donations
    const donations = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    // Calculate summary statistics
    const summary = await this.calculateUserDonationSummary(
      userId,
      startDate,
      endDate,
    );

    // Transform donations to DTOs
    const donationItems: UserDonationItemDto[] = donations.map((donation) =>
      UserDonationItemDto.fromEntity(donation),
    );

    return {
      data: donationItems,
      total,
      page,
      limit,
      summary,
    };
  }

  private async calculateUserDonationSummary(
    userId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<UserDonationSummaryDto> {
    const queryBuilder = this.donationsRepository
      .createQueryBuilder('donation')
      .select('COUNT(donation.id)', 'totalDonations')
      .addSelect('SUM(donation.amount)', 'totalAmount')
      .addSelect('COUNT(DISTINCT donation.projectId)', 'projectsSupported')
      .addSelect('MIN(donation.createdAt)', 'firstDonationDate')
      .addSelect('MAX(donation.createdAt)', 'lastDonationDate')
      .where('donation.donorId = :userId', { userId });

    // Apply date range filters if provided
    if (startDate) {
      queryBuilder.andWhere('donation.createdAt >= :startDate', {
        startDate: new Date(startDate),
      });
    }

    if (endDate) {
      queryBuilder.andWhere('donation.createdAt <= :endDate', {
        endDate: new Date(endDate),
      });
    }

    const result = await queryBuilder.getRawOne();

    const totalDonations = parseInt(result.totalDonations, 10) || 0;
    const totalAmount = parseFloat(result.totalAmount) || 0;

    return {
      totalDonations,
      totalAmount,
      averageDonation: totalDonations > 0 ? totalAmount / totalDonations : 0,
      projectsSupported: parseInt(result.projectsSupported, 10) || 0,
      firstDonationDate: result.firstDonationDate
        ? new Date(result.firstDonationDate)
        : null,
      lastDonationDate: result.lastDonationDate
        ? new Date(result.lastDonationDate)
        : null,
    };
  }

  /**
   * Process a webhook donation notification
   * Handles duplicate webhooks gracefully and verifies on blockchain
   */
  async processWebhookDonation(
    webhookDto: WebhookDonationDto,
    donorId?: string,
  ): Promise<WebhookResponseDto> {
    const {
      transactionHash,
      projectId,
      amount,
      assetType = 'XLM',
      isAnonymous = false,
      webhookId,
    } = webhookDto;

    try {
      // 1. Check for duplicate webhook using webhookId or transaction hash
      const dedupKey = webhookId || transactionHash;
      const existingWebhook = processedWebhooks.get(dedupKey);

      if (existingWebhook) {
        // Check if donation still exists
        const existingDonation = await this.donationsRepository.findOne({
          where: { id: existingWebhook.donationId },
        });

        if (existingDonation) {
          this.logger.log(`Duplicate webhook detected: ${dedupKey}`);
          return {
            success: true,
            message: 'Donation already processed',
            donationId: existingDonation.id,
            duplicate: true,
          };
        }

        // Clean up stale entry
        processedWebhooks.delete(dedupKey);
      }

      // 2. Check if project exists
      const project = await this.projectRepository.findOne({
        where: { id: projectId },
      });

      if (!project) {
        throw new NotFoundException(`Project with ID ${projectId} not found`);
      }

      // 3. Check for duplicate transaction hash in database
      const existingDonation = await this.donationsRepository.findOne({
        where: { transactionHash },
      });

      if (existingDonation) {
        // Mark webhook as processed
        processedWebhooks.set(dedupKey, {
          donationId: existingDonation.id,
          processedAt: new Date(),
        });

        return {
          success: true,
          message: 'Donation already exists with this transaction hash',
          donationId: existingDonation.id,
          duplicate: true,
        };
      }

      // 4. Verify transaction on Stellar blockchain with detailed validation
      const verificationResult =
        await this.stellarBlockchainService.verifyTransaction(
          transactionHash,
          amount,
          assetType,
        );

      if (!verificationResult.isValid) {
        throw new BadRequestException(
          `Transaction verification failed: ${verificationResult.error || 'Unknown error'}`,
        );
      }

      // 5. Create and save donation
      const donation = this.donationsRepository.create({
        projectId,
        donorId: isAnonymous ? null : donorId || null,
        amount,
        assetType,
        transactionHash,
        isAnonymous,
      });

      const savedDonation = await this.donationsRepository.save(donation);

      // 6. Update project funds_raised and donationCount atomically
      await this.projectRepository.update(
        { id: projectId },
        {
          fundsRaised: () =>
            `CAST(fundsRaised + ${Number(amount)} AS decimal(18,7))`,
          donationCount: () => 'donationCount + 1',
        },
      );

      // 7. Update progress
      const updatedProject = await this.projectRepository.findOne({
        where: { id: projectId },
      });

      if (updatedProject) {
        const goalAmount = Number(updatedProject.goalAmount) || 1;
        const fundsRaised = Number(updatedProject.fundsRaised) || 0;
        const progress = Math.min((fundsRaised / goalAmount) * 100, 100);

        await this.projectRepository.update(
          { id: projectId },
          {
            progress: Math.round(progress * 100) / 100,
          },
        );
      }

      // 8. Mark webhook as processed
      processedWebhooks.set(dedupKey, {
        donationId: savedDonation.id,
        processedAt: new Date(),
      });

      // 9. Send confirmation email to donor (if not anonymous and donorId available)
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
        });
      }

      // 10. Clean old entries from deduplication cache periodically
      this.cleanupOldWebhookEntries();

      return {
        success: true,
        message: 'Donation processed successfully',
        donationId: savedDonation.id,
        duplicate: false,
      };
    } catch (error) {
      // Re-throw known exceptions
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      // Handle database-specific errors
      if (error.code === '23505') {
        // PostgreSQL unique violation - transaction hash already exists
        // Still return success since donation was created
        const existingDonation = await this.donationsRepository.findOne({
          where: { transactionHash },
        });

        if (existingDonation) {
          // Use transactionHash as dedup key if webhookId not available
          const dedupKeyForCatch = webhookDto.webhookId || transactionHash;
          processedWebhooks.set(dedupKeyForCatch, {
            donationId: existingDonation.id,
            processedAt: new Date(),
          });

          return {
            success: true,
            message: 'Donation already exists with this transaction hash',
            donationId: existingDonation.id,
            duplicate: true,
          };
        }
      }

      if (error.code === '23503') {
        // PostgreSQL foreign key violation
        throw new BadRequestException('Invalid project ID');
      }

      this.logger.error('Error processing webhook donation:', error);
      throw new BadRequestException('Failed to process donation webhook');
    }
  }

  /**
   * Clean up old entries from webhook deduplication cache
   */
  private cleanupOldWebhookEntries(): void {
    const now = Date.now();
    for (const [key, value] of processedWebhooks.entries()) {
      if (now - value.processedAt.getTime() > WEBHOOK_DEDUP_TTL_MS) {
        processedWebhooks.delete(key);
      }
    }
  }

  /**
   * Get leaderboard of top donors
   * Supports global and project-specific leaderboards
   * Respects user anonymity preferences
   */
  async getLeaderboard(
    scope: LeaderboardScope,
    projectId: string | undefined,
    page: number = 1,
    limit: number = 100,
  ): Promise<LeaderboardResponseDto> {
    // Validate projectId for project scope
    if (scope === LeaderboardScope.PROJECT && !projectId) {
      throw new BadRequestException(
        'Project ID is required for project-specific leaderboard',
      );
    }

    // Generate cache key
    const cacheKey = `${scope}:${projectId || 'global'}:page${page}:limit${limit}`;

    // Check cache
    const cached = leaderboardCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < LEADERBOARD_CACHE_TTL_MS) {
      return cached.data;
    }

    // Build query for leaderboard
    const queryBuilder = this.donationsRepository
      .createQueryBuilder('donation')
      .leftJoinAndSelect('donation.donor', 'donor')
      .select('donor.id', 'userId')
      .addSelect('donor.firstName', 'firstName')
      .addSelect('donor.lastName', 'lastName')
      .addSelect('donor.avatarUrl', 'avatarUrl')
      .addSelect('donation.isAnonymous', 'isAnonymous')
      .addSelect('SUM(donation.amount)', 'totalAmount')
      .addSelect('COUNT(donation.id)', 'donationCount')
      .addSelect('COUNT(DISTINCT donation.projectId)', 'projectsSupported')
      .where('donation.donorId IS NOT NULL')
      .andWhere('donation.isAnonymous = :isAnonymous', { isAnonymous: false })
      .groupBy('donor.id')
      .addGroupBy('donor.firstName')
      .addGroupBy('donor.lastName')
      .addGroupBy('donor.avatarUrl')
      .addGroupBy('donation.isAnonymous')
      .orderBy('SUM(donation.amount)', 'DESC');

    // Apply project filter if project scope
    if (scope === LeaderboardScope.PROJECT && projectId) {
      queryBuilder.andWhere('donation.projectId = :projectId', { projectId });
      // For project scope, don't count distinct projects (it's always 1)
      queryBuilder.select('donor.id', 'userId');
      queryBuilder.addSelect('donor.firstName', 'firstName');
      queryBuilder.addSelect('donor.lastName', 'lastName');
      queryBuilder.addSelect('donor.avatarUrl', 'avatarUrl');
      queryBuilder.addSelect('donation.isAnonymous', 'isAnonymous');
      queryBuilder.addSelect('SUM(donation.amount)', 'totalAmount');
      queryBuilder.addSelect('COUNT(donation.id)', 'donationCount');
      queryBuilder.addSelect('1', 'projectsSupported');
    }

    // Get total count for pagination
    const countQuery = queryBuilder.clone();
    const totalResult = await countQuery
      .select('COUNT(DISTINCT donor.id)', 'total')
      .getRawOne();
    const total = parseInt(totalResult.total, 10) || 0;

    // Apply pagination
    queryBuilder.skip((page - 1) * limit).take(limit);

    // Execute query
    const rawResults = await queryBuilder.getRawMany();

    // Transform results to DTOs
    const donors: LeaderboardDonorDto[] = rawResults.map((result, index) => {
      const rank = (page - 1) * limit + index + 1;
      const assetType = 'XLM'; // Default to XLM, could be enhanced to track actual asset
      const conversionRate = ASSET_CONVERSION_RATES[assetType] || 1;
      const totalAmountUsd = parseFloat(result.totalAmount) * conversionRate;

      return {
        rank,
        userId: result.userId,
        displayName: `${result.firstName || ''} ${result.lastName || ''}`.trim() || 'Anonymous',
        avatarUrl: result.avatarUrl || null,
        totalAmountUsd: Math.round(totalAmountUsd * 100) / 100,
        donationCount: parseInt(result.donationCount, 10) || 0,
        projectsSupported: parseInt(result.projectsSupported, 10) || 1,
        isAnonymous: result.isAnonymous === 'true',
      };
    });

    const response: LeaderboardResponseDto = {
      data: donors,
      total,
      page,
      limit,
      scope,
      projectId: projectId || null,
      generatedAt: new Date(),
    };

    // Cache the result
    leaderboardCache.set(cacheKey, {
      data: response,
      timestamp: Date.now(),
    });

    return response;
  }

  /**
   * Clear leaderboard cache
   * Can be called when new donations are made to refresh the leaderboard
   */
  clearLeaderboardCache(): void {
    leaderboardCache.clear();
    this.logger.log('Leaderboard cache cleared');
  }

  /**
   * Get asset conversion rate to USD
   * In production, this should call a price oracle service
   */
  getAssetConversionRate(assetType: string): number {
    return ASSET_CONVERSION_RATES[assetType] || 1;
  }
}
