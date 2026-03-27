import { IsOptional, IsEnum, IsUUID, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum LeaderboardScope {
  GLOBAL = 'global',
  PROJECT = 'project',
}

export class LeaderboardQueryDto {
  @ApiPropertyOptional({
    enum: LeaderboardScope,
    default: LeaderboardScope.GLOBAL,
    description: 'Scope of leaderboard: global or project-specific',
  })
  @IsOptional()
  @IsEnum(LeaderboardScope)
  scope?: LeaderboardScope = LeaderboardScope.GLOBAL;

  @ApiPropertyOptional({
    description: 'Project ID for project-specific leaderboard',
    type: String,
  })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({
    default: 100,
    minimum: 1,
    maximum: 100,
    description: 'Number of top donors to return (max 100)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 100;

  @ApiPropertyOptional({
    default: 1,
    minimum: 1,
    description: 'Page number for pagination',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;
}
