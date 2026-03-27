import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { WithdrawalsService } from './providers/withdrawals.service';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { WithdrawalResponseDto } from './dto/withdrawal-response.dto';

@Controller('withdrawals')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WithdrawalsController {
  constructor(private readonly withdrawalsService: WithdrawalsService) {}

  @Post()
  @Roles(UserRole.CREATOR)
  @HttpCode(HttpStatus.CREATED)
  async createWithdrawal(
    @Body() createWithdrawalDto: CreateWithdrawalDto,
    @Request() req,
  ): Promise<WithdrawalResponseDto> {
    const withdrawal = await this.withdrawalsService.createWithdrawal(
      createWithdrawalDto,
      req.user.sub,
    );

    return {
      id: withdrawal.id,
      projectId: withdrawal.projectId,
      amount: withdrawal.amount,
      status: withdrawal.status,
      transactionHash: withdrawal.transactionHash,
      rejectionReason: withdrawal.rejectionReason,
      createdAt: withdrawal.createdAt,
      updatedAt: withdrawal.updatedAt,
    };
  }

  @Get('project/:projectId')
  @Roles(UserRole.CREATOR)
  async getProjectWithdrawals(
    @Param('projectId') projectId: string,
    @Request() req,
  ): Promise<WithdrawalResponseDto[]> {
    const withdrawals = await this.withdrawalsService.getProjectWithdrawals(
      projectId,
      req.user.sub,
    );

    return withdrawals.map((withdrawal) => ({
      id: withdrawal.id,
      projectId: withdrawal.projectId,
      amount: withdrawal.amount,
      status: withdrawal.status,
      transactionHash: withdrawal.transactionHash,
      rejectionReason: withdrawal.rejectionReason,
      createdAt: withdrawal.createdAt,
      updatedAt: withdrawal.updatedAt,
    }));
  }

  @Get(':id')
  @Roles(UserRole.CREATOR)
  async getWithdrawalById(
    @Param('id') id: string,
    @Request() req,
  ): Promise<WithdrawalResponseDto> {
    const withdrawal = await this.withdrawalsService.getWithdrawalById(
      id,
      req.user.sub,
    );

    return {
      id: withdrawal.id,
      projectId: withdrawal.projectId,
      amount: withdrawal.amount,
      status: withdrawal.status,
      transactionHash: withdrawal.transactionHash,
      rejectionReason: withdrawal.rejectionReason,
      createdAt: withdrawal.createdAt,
      updatedAt: withdrawal.updatedAt,
    };
  }
}
