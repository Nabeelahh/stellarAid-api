import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminReportsController } from './admin-reports.controller';
import { AdminReportsService } from './services/admin-reports.service';
import { StellarSyncController } from './stellar-sync.controller';
import { User } from '../users/entities/user.entity';
import { Project } from '../projects/entities/project.entity';
import { Donation } from '../donations/entities/donation.entity';
import { ProjectHistory } from '../projects/entities/project-history.entity';
import { Withdrawal } from '../withdrawals/entities/withdrawal.entity';
import { RolesGuard } from '../common/guards/roles.guard';
import { MailModule } from '../mail/mail.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Project,
      Donation,
      ProjectHistory,
      Withdrawal,
    ]),
    MailModule,
    CommonModule,
  ],
  controllers: [AdminDashboardController, AdminReportsController, StellarSyncController],
  providers: [AdminDashboardService, AdminReportsService, RolesGuard],
})
export class AdminModule {}
