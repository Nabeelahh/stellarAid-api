import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Project } from '../../projects/entities/project.entity';
import { Donation } from '../../donations/entities/donation.entity';
import { Withdrawal } from '../../withdrawals/entities/withdrawal.entity';
import { UserRole } from '../../common/enums/user-role.enum';
import { ProjectStatus } from '../../common/enums/project-status.enum';
import { WithdrawalStatus } from '../../common/enums/withdrawal-status.enum';
import { KYCStatus } from '../../common/enums/kyc-status.enum';
import { ReportType, GenerateReportDto } from '../dto/generate-report.dto';
import { MailService } from '../../mail/mail.service';

@Injectable()
export class AdminReportsService {
  private readonly logger = new Logger(AdminReportsService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(Donation)
    private readonly donationRepository: Repository<Donation>,
    @InjectRepository(Withdrawal)
    private readonly withdrawalRepository: Repository<Withdrawal>,
    private readonly mailService: MailService,
  ) {}

  async generateReport(dto: GenerateReportDto): Promise<{ csvData: string; filename: string; summary?: any }> {
    const { reportType, startDate, endDate, includeSummary } = dto;
    
    this.logger.log(`Generating ${reportType} report from ${startDate} to ${endDate}`);

    let csvData: string;
    let filename: string;
    let summary: any;

    switch (reportType) {
      case ReportType.USERS:
        const usersResult = await this.generateUsersReport(startDate, endDate, includeSummary);
        csvData = usersResult.csvData;
        filename = usersResult.filename;
        summary = usersResult.summary;
        break;
      
      case ReportType.PROJECTS:
        const projectsResult = await this.generateProjectsReport(startDate, endDate, includeSummary);
        csvData = projectsResult.csvData;
        filename = projectsResult.filename;
        summary = projectsResult.summary;
        break;
      
      case ReportType.DONATIONS:
        const donationsResult = await this.generateDonationsReport(startDate, endDate, includeSummary);
        csvData = donationsResult.csvData;
        filename = donationsResult.filename;
        summary = donationsResult.summary;
        break;
      
      case ReportType.WITHDRAWALS:
        const withdrawalsResult = await this.generateWithdrawalsReport(startDate, endDate, includeSummary);
        csvData = withdrawalsResult.csvData;
        filename = withdrawalsResult.filename;
        summary = withdrawalsResult.summary;
        break;
      
      default:
        throw new Error(`Unsupported report type: ${reportType}`);
    }

    // Send email if requested
    if (dto.email) {
      await this.sendReportEmail(dto.email, reportType, filename, csvData, summary);
    }

    return { csvData, filename, summary: includeSummary ? summary : undefined };
  }

  private async generateUsersReport(startDate?: Date, endDate?: Date, includeSummary?: boolean) {
    const query = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.donations', 'donations')
      .leftJoinAndSelect('user.projects', 'projects')
      .where('user.deletedAt IS NULL');

    if (startDate) {
      query.andWhere('user.createdAt >= :startDate', { startDate });
    }
    if (endDate) {
      query.andWhere('user.createdAt <= :endDate', { endDate });
    }

    const users = await query.getMany();

    // Generate CSV
    const headers = [
      'ID', 'Email', 'First Name', 'Last Name', 'Wallet Address', 'Role',
      'KYC Status', 'Email Verified', 'Country', 'Created At', 'Updated At',
      'Total Donations', 'Total Projects Created'
    ];

    const csvRows = users.map(user => [
      user.id,
      user.email,
      user.firstName,
      user.lastName,
      user.walletAddress || '',
      user.role,
      user.kycStatus,
      user.isEmailVerified,
      user.country || '',
      user.createdAt.toISOString(),
      user.updatedAt.toISOString(),
      user.donations?.length || 0,
      user.projects?.length || 0
    ]);

    const csvData = this.convertToCSV(headers, csvRows);
    const filename = `users_report_${new Date().toISOString().split('T')[0]}.csv`;

    // Generate summary
    let summary;
    if (includeSummary) {
      const roleStats = users.reduce((acc, user) => {
        acc[user.role] = (acc[user.role] || 0) + 1;
        return acc;
      }, {} as Record<UserRole, number>);

      const kycStats = users.reduce((acc, user) => {
        acc[user.kycStatus] = (acc[user.kycStatus] || 0) + 1;
        return acc;
      }, {} as Record<KYCStatus, number>);

      const verifiedEmailCount = users.filter(u => u.isEmailVerified).length;
      const walletLinkedCount = users.filter(u => user.walletAddress).length;

      summary = {
        totalUsers: users.length,
        roleBreakdown: roleStats,
        kycBreakdown: kycStats,
        verifiedEmails: verifiedEmailCount,
        walletLinked: walletLinkedCount,
        dateRange: {
          startDate: startDate?.toISOString() || null,
          endDate: endDate?.toISOString() || null
        }
      };
    }

    return { csvData, filename, summary };
  }

  private async generateProjectsReport(startDate?: Date, endDate?: Date, includeSummary?: boolean) {
    const query = this.projectRepository
      .createQueryBuilder('project')
      .leftJoinAndSelect('project.creator', 'creator')
      .leftJoinAndSelect('project.donations', 'donations')
      .leftJoinAndSelect('project.withdrawals', 'withdrawals');

    if (startDate) {
      query.andWhere('project.createdAt >= :startDate', { startDate });
    }
    if (endDate) {
      query.andWhere('project.createdAt <= :endDate', { endDate });
    }

    const projects = await query.getMany();

    // Generate CSV
    const headers = [
      'ID', 'Title', 'Description', 'Category', 'Status', 'Goal Amount',
      'Funds Raised', 'Progress (%)', 'Donation Count', 'Creator ID',
      'Creator Email', 'Deadline', 'Created At', 'Updated At',
      'Total Withdrawals'
    ];

    const csvRows = projects.map(project => [
      project.id,
      project.title,
      project.description.replace(/[\r\n]/g, ' '), // Remove newlines
      project.category,
      project.status,
      project.goalAmount.toString(),
      project.fundsRaised.toString(),
      project.progress.toString(),
      project.donationCount.toString(),
      project.creatorId,
      project.creator?.email || '',
      project.deadline?.toISOString() || '',
      project.createdAt.toISOString(),
      project.updatedAt.toISOString(),
      project.withdrawals?.length || 0
    ]);

    const csvData = this.convertToCSV(headers, csvRows);
    const filename = `projects_report_${new Date().toISOString().split('T')[0]}.csv`;

    // Generate summary
    let summary;
    if (includeSummary) {
      const statusStats = projects.reduce((acc, project) => {
        acc[project.status] = (acc[project.status] || 0) + 1;
        return acc;
      }, {} as Record<ProjectStatus, number>);

      const categoryStats = projects.reduce((acc, project) => {
        acc[project.category] = (acc[project.category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const totalGoalAmount = projects.reduce((sum, p) => sum + Number(p.goalAmount), 0);
      const totalFundsRaised = projects.reduce((sum, p) => sum + Number(p.fundsRaised), 0);
      const totalDonations = projects.reduce((sum, p) => sum + p.donationCount, 0);

      summary = {
        totalProjects: projects.length,
        statusBreakdown: statusStats,
        categoryBreakdown: categoryStats,
        totalGoalAmount,
        totalFundsRaised,
        overallProgress: totalGoalAmount > 0 ? (totalFundsRaised / totalGoalAmount) * 100 : 0,
        totalDonations,
        dateRange: {
          startDate: startDate?.toISOString() || null,
          endDate: endDate?.toISOString() || null
        }
      };
    }

    return { csvData, filename, summary };
  }

  private async generateDonationsReport(startDate?: Date, endDate?: Date, includeSummary?: boolean) {
    const query = this.donationRepository
      .createQueryBuilder('donation')
      .leftJoinAndSelect('donation.project', 'project')
      .leftJoinAndSelect('donation.donor', 'donor');

    if (startDate) {
      query.andWhere('donation.createdAt >= :startDate', { startDate });
    }
    if (endDate) {
      query.andWhere('donation.createdAt <= :endDate', { endDate });
    }

    const donations = await query.getMany();

    // Generate CSV
    const headers = [
      'ID', 'Project ID', 'Project Title', 'Donor ID', 'Donor Email',
      'Amount', 'Asset Type', 'Transaction Hash', 'Is Anonymous',
      'Created At'
    ];

    const csvRows = donations.map(donation => [
      donation.id,
      donation.projectId,
      donation.project?.title || '',
      donation.donorId || '',
      donation.donor?.email || '',
      donation.amount.toString(),
      donation.assetType,
      donation.transactionHash || '',
      donation.isAnonymous.toString(),
      donation.createdAt.toISOString()
    ]);

    const csvData = this.convertToCSV(headers, csvRows);
    const filename = `donations_report_${new Date().toISOString().split('T')[0]}.csv`;

    // Generate summary
    let summary;
    if (includeSummary) {
      const assetStats = donations.reduce((acc, donation) => {
        acc[donation.assetType] = {
          count: (acc[donation.assetType]?.count || 0) + 1,
          totalAmount: (acc[donation.assetType]?.totalAmount || 0) + Number(donation.amount)
        };
        return acc;
      }, {} as Record<string, { count: number; totalAmount: number }>);

      const anonymousCount = donations.filter(d => d.isAnonymous).length;
      const withTransactionHash = donations.filter(d => donation.transactionHash).length;

      const totalAmount = donations.reduce((sum, d) => sum + Number(d.amount), 0);

      summary = {
        totalDonations: donations.length,
        totalAmount,
        assetBreakdown: assetStats,
        anonymousDonations: anonymousCount,
        verifiedTransactions: withTransactionHash,
        dateRange: {
          startDate: startDate?.toISOString() || null,
          endDate: endDate?.toISOString() || null
        }
      };
    }

    return { csvData, filename, summary };
  }

  private async generateWithdrawalsReport(startDate?: Date, endDate?: Date, includeSummary?: boolean) {
    const query = this.withdrawalRepository
      .createQueryBuilder('withdrawal')
      .leftJoinAndSelect('withdrawal.project', 'project');

    if (startDate) {
      query.andWhere('withdrawal.createdAt >= :startDate', { startDate });
    }
    if (endDate) {
      query.andWhere('withdrawal.createdAt <= :endDate', { endDate });
    }

    const withdrawals = await query.getMany();

    // Generate CSV
    const headers = [
      'ID', 'Project ID', 'Project Title', 'Amount', 'Asset Type',
      'Status', 'Transaction Hash', 'Rejection Reason', 'Created At', 'Updated At'
    ];

    const csvRows = withdrawals.map(withdrawal => [
      withdrawal.id,
      withdrawal.projectId,
      withdrawal.project?.title || '',
      withdrawal.amount.toString(),
      withdrawal.assetType,
      withdrawal.status,
      withdrawal.transactionHash || '',
      withdrawal.rejectionReason || '',
      withdrawal.createdAt.toISOString(),
      withdrawal.updatedAt.toISOString()
    ]);

    const csvData = this.convertToCSV(headers, csvRows);
    const filename = `withdrawals_report_${new Date().toISOString().split('T')[0]}.csv`;

    // Generate summary
    let summary;
    if (includeSummary) {
      const statusStats = withdrawals.reduce((acc, withdrawal) => {
        acc[withdrawal.status] = {
          count: (acc[withdrawal.status]?.count || 0) + 1,
          totalAmount: (acc[withdrawal.status]?.totalAmount || 0) + Number(withdrawal.amount)
        };
        return acc;
      }, {} as Record<WithdrawalStatus, { count: number; totalAmount: number }>);

      const assetStats = withdrawals.reduce((acc, withdrawal) => {
        acc[withdrawal.assetType] = {
          count: (acc[withdrawal.assetType]?.count || 0) + 1,
          totalAmount: (acc[withdrawal.assetType]?.totalAmount || 0) + Number(withdrawal.amount)
        };
        return acc;
      }, {} as Record<string, { count: number; totalAmount: number }>);

      const totalAmount = withdrawals.reduce((sum, w) => sum + Number(w.amount), 0);
      const withTransactionHash = withdrawals.filter(w => w.transactionHash).length;

      summary = {
        totalWithdrawals: withdrawals.length,
        totalAmount,
        statusBreakdown: statusStats,
        assetBreakdown: assetStats,
        processedTransactions: withTransactionHash,
        dateRange: {
          startDate: startDate?.toISOString() || null,
          endDate: endDate?.toISOString() || null
        }
      };
    }

    return { csvData, filename, summary };
  }

  private convertToCSV(headers: string[], rows: string[][]): string {
    const csvContent = [
      headers.join(','),
      ...rows.map(row => 
        row.map(field => {
          // Escape commas and quotes in fields
          if (field.includes(',') || field.includes('"') || field.includes('\n')) {
            return `"${field.replace(/"/g, '""')}"`;
          }
          return field;
        }).join(',')
      )
    ].join('\n');
    
    return csvContent;
  }

  private async sendReportEmail(
    email: string,
    reportType: ReportType,
    filename: string,
    csvData: string,
    summary?: any
  ) {
    try {
      const subject = `StellarAid ${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report`;
      
      let summaryText = '';
      if (summary) {
        summaryText = '\n\nSummary Statistics:\n' + JSON.stringify(summary, null, 2);
      }

      await this.mailService.sendMail({
        to: email,
        subject,
        text: `Please find attached the ${reportType} report you requested.${summaryText}`,
        attachments: [
          {
            filename,
            content: csvData,
            contentType: 'text/csv'
          }
        ]
      });

      this.logger.log(`Report sent successfully to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send report email to ${email}:`, error);
      throw error;
    }
  }
}
