import { IsEnum, IsOptional, IsString, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum ReportType {
  USERS = 'users',
  PROJECTS = 'projects',
  DONATIONS = 'donations',
  WITHDRAWALS = 'withdrawals',
}

export class GenerateReportDto {
  @ApiProperty({
    description: 'Type of report to generate',
    enum: ReportType,
    example: ReportType.DONATIONS,
  })
  @IsEnum(ReportType)
  reportType: ReportType;

  @ApiPropertyOptional({
    description: 'Start date for filtering records (ISO 8601 format)',
    example: '2024-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  @Type(() => Date)
  startDate?: Date;

  @ApiPropertyOptional({
    description: 'End date for filtering records (ISO 8601 format)',
    example: '2024-12-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  @Type(() => Date)
  endDate?: Date;

  @ApiPropertyOptional({
    description: 'Email address to send the report to (optional)',
    example: 'admin@stellaraid.com',
  })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({
    description: 'Whether to include summary statistics',
    example: true,
    default: true,
  })
  @IsOptional()
  includeSummary?: boolean = true;
}
