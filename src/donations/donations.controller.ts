import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  HttpException,
  UseGuards,
  Headers,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { DonationsService } from './providers/donations.service';
import { CreateDonationDto } from './dto/create-donation.dto';
import { UpdateDonationDto } from './dto/update-donation.dto';
import { DonationResponseDto } from './dto/donation-response.dto';
import { WebhookDonationDto, WebhookResponseDto } from './dto/webhook.dto';
import {
  LeaderboardQueryDto,
  LeaderboardScope,
} from './dto/leaderboard-query.dto';
import { LeaderboardResponseDto } from './dto/leaderboard-response.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { WebhookSignatureService } from '../common/services/webhook-signature.service';

@ApiTags('Donations')
@Controller('donations')
export class DonationsController {
  constructor(
    private readonly donationsService: DonationsService,
    private readonly webhookSignatureService: WebhookSignatureService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new donation with Stellar blockchain verification',
  })
  @ApiResponse({
    status: 201,
    type: DonationResponseDto,
    description: 'Donation created successfully',
  })
  @ApiResponse({
    status: 400,
    description:
      'Bad request - Invalid data or transaction verification failed',
  })
  @ApiResponse({ status: 404, description: 'Project not found' })
  @ApiResponse({
    status: 409,
    description: 'Conflict - Transaction hash already exists',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token missing or invalid',
  })
  async create(
    @Body() createDonationDto: CreateDonationDto,
    @CurrentUser('sub') userId: string,
  ) {
    // If donation is anonymous, pass undefined as donorId, otherwise pass the authenticated user's ID
    const donorId = createDonationDto.isAnonymous ? undefined : userId;
    return this.donationsService.create(createDonationDto, donorId);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'Get all donations with pagination' })
  @ApiResponse({ status: 200, description: 'List of donations' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  findAll(@Query('page') page: number = 1, @Query('limit') limit: number = 10) {
    return this.donationsService.findAll(page, limit);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get donation by ID' })
  @ApiResponse({ status: 200, type: DonationResponseDto })
  @ApiResponse({ status: 404, description: 'Donation not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.donationsService.findOne(id);
  }

  @Get('project/:projectId')
  @Public()
  @ApiOperation({ summary: 'Get donations for a specific project' })
  @ApiResponse({ status: 200, description: 'List of project donations' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  findByProject(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.donationsService.findByProject(projectId, page, limit);
  }

  @Get('donor/:donorId')
  @ApiOperation({ summary: 'Get donations by a specific donor' })
  @ApiResponse({ status: 200, description: 'List of donor donations' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  findByDonor(
    @Param('donorId', ParseUUIDPipe) donorId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.donationsService.findByDonor(donorId, page, limit);
  }

  @Get('transaction/:hash')
  @Public()
  @ApiOperation({ summary: 'Get donation by transaction hash' })
  @ApiResponse({ status: 200, type: DonationResponseDto })
  @ApiResponse({ status: 404, description: 'Donation not found' })
  findByTransactionHash(@Param('hash') hash: string) {
    return this.donationsService.findByTransactionHash(hash);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a donation' })
  @ApiResponse({ status: 200, type: DonationResponseDto })
  @ApiResponse({ status: 404, description: 'Donation not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDonationDto: UpdateDonationDto,
  ) {
    return this.donationsService.update(id, updateDonationDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a donation' })
  @ApiResponse({ status: 200, description: 'Donation deleted successfully' })
  @ApiResponse({ status: 404, description: 'Donation not found' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.donationsService.remove(id);
  }

  @Get('analytics/project/:projectId/total')
  @Public()
  @ApiOperation({ summary: 'Get total donations amount for a project' })
  @ApiResponse({ status: 200, description: 'Total donations amount' })
  getTotalForProject(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.donationsService.getTotalDonationsForProject(projectId);
  }

  @Get('analytics/project/:projectId/count')
  @Public()
  @ApiOperation({ summary: 'Get donation count for a project' })
  @ApiResponse({ status: 200, description: 'Donation count' })
  getCountForProject(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.donationsService.getDonationCountForProject(projectId);
  }

  @Get('leaderboard')
  @Public()
  @ApiOperation({
    summary: 'Get top donors leaderboard',
    description:
      'Returns ranked list of top donors. Supports global leaderboard or project-specific. Respects user anonymity preferences. Results are cached for 5 minutes.',
  })
  @ApiResponse({
    status: 200,
    type: LeaderboardResponseDto,
    description: 'Leaderboard retrieved successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Project ID required for project scope',
  })
  @ApiQuery({
    name: 'scope',
    required: false,
    enum: LeaderboardScope,
    description: 'Scope of leaderboard: global or project',
  })
  @ApiQuery({
    name: 'projectId',
    required: false,
    type: String,
    description: 'Project ID for project-specific leaderboard',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of results (1-100, default 100)',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default 1)',
  })
  async getLeaderboard(
    @Query() query: LeaderboardQueryDto,
  ): Promise<LeaderboardResponseDto> {
    return this.donationsService.getLeaderboard(
      query.scope || LeaderboardScope.GLOBAL,
      query.projectId,
      query.page,
      query.limit,
    );
  }

  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Webhook endpoint for real-time donation notifications',
  })
  @ApiResponse({
    status: 200,
    type: WebhookResponseDto,
    description: 'Webhook processed successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid payload or signature',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid webhook signature',
  })
  async handleWebhook(
    @Body() webhookDto: WebhookDonationDto,
    @Headers() headers: Record<string, string | string[]>,
    @Req() req: ExpressRequest,
  ): Promise<WebhookResponseDto> {
    // Get raw body for signature validation
    const rawBody =
      ((req as any).rawBody as string) || JSON.stringify(webhookDto);

    // Extract signature and timestamp from headers
    const { signature, timestamp } =
      this.webhookSignatureService.extractHeaders(headers);

    // Validate webhook signature
    const isValidSignature = this.webhookSignatureService.validateSignature(
      rawBody,
      signature,
      timestamp,
    );

    if (!isValidSignature) {
      throw new HttpException(
        'Invalid webhook signature',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Process the webhook donation
    return this.donationsService.processWebhookDonation(webhookDto);
  }
}
