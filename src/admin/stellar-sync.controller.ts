import { Controller, Get, Post, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../common/enums/user-role.enum';
import { StellarSyncProcessorService } from '../common/services/stellar-sync-processor.service';

@ApiTags('Admin')
@ApiBearerAuth('JWT-auth')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/stellar-sync')
export class StellarSyncController {
  constructor(private readonly stellarSyncProcessor: StellarSyncProcessorService) {}

  @Get('status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get Stellar sync processor status (Admin only)',
    description: 'Returns the current status of the Stellar Horizon polling service',
  })
  @ApiResponse({ status: 200, description: 'Sync status retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  getSyncStatus() {
    return this.stellarSyncProcessor.getSyncStatus();
  }

  @Post('trigger')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Manually trigger Stellar sync (Admin only)',
    description: 'Manually trigger a sync of Stellar Horizon transactions',
  })
  @ApiResponse({ status: 200, description: 'Sync triggered successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async triggerSync() {
    return this.stellarSyncProcessor.triggerSync();
  }
}
