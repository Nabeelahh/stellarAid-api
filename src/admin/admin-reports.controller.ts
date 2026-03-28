import { Controller, Post, HttpCode, HttpStatus, Body, UseGuards, Get, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiProduces,
} from '@nestjs/swagger';
import { Response } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../common/enums/user-role.enum';
import { GenerateReportDto, ReportType } from './dto/generate-report.dto';
import { AdminReportsService } from './services/admin-reports.service';

@ApiTags('Admin')
@ApiBearerAuth('JWT-auth')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/reports')
export class AdminReportsController {
  constructor(private readonly adminReportsService: AdminReportsService) {}

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate platform reports (Admin only)',
    description: 'Generate CSV reports for users, projects, donations, or withdrawals with optional date filtering and email delivery',
  })
  @ApiResponse({ status: 200, description: 'Report generated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  async generateReport(@Body() generateReportDto: GenerateReportDto) {
    return this.adminReportsService.generateReport(generateReportDto);
  }

  @Post('generate-and-download')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate and download report as CSV file (Admin only)',
    description: 'Generate a report and immediately download it as a CSV file',
  })
  @ApiProduces('text/csv')
  @ApiResponse({ status: 200, description: 'CSV file downloaded successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async generateAndDownloadReport(
    @Body() generateReportDto: GenerateReportDto,
    @Res() res: Response,
  ) {
    const { csvData, filename } = await this.adminReportsService.generateReport({
      ...generateReportDto,
      email: undefined, // Don't send email for download
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvData);
  }

  @Get('types')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get available report types (Admin only)',
    description: 'Returns a list of all available report types that can be generated',
  })
  @ApiResponse({ status: 200, description: 'Report types retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  getReportTypes() {
    return {
      reportTypes: Object.values(ReportType).map(type => ({
        type,
        description: this.getReportTypeDescription(type),
      })),
    };
  }

  private getReportTypeDescription(type: ReportType): string {
    switch (type) {
      case ReportType.USERS:
        return 'User registration and activity data including KYC status and role information';
      case ReportType.PROJECTS:
        return 'Project creation and funding data including status and progress information';
      case ReportType.DONATIONS:
        return 'Donation transaction data including amounts, assets, and project associations';
      case ReportType.WITHDRAWALS:
        return 'Withdrawal request data including status and transaction information';
      default:
        return 'Unknown report type';
    }
  }
}
