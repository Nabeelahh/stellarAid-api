import { ApiProperty } from '@nestjs/swagger';

export class LeaderboardDonorDto {
  @ApiProperty({
    description: 'Rank of the donor on the leaderboard',
    example: 1,
  })
  rank: number;

  @ApiProperty({
    description: 'User ID of the donor (null if anonymous)',
    example: '550e8400-e29b-41d4-a716-446655440000',
    nullable: true,
  })
  userId: string | null;

  @ApiProperty({
    description: 'Display name of the donor',
    example: 'John Doe',
  })
  displayName: string;

  @ApiProperty({
    description: 'Avatar URL of the donor',
    example: 'https://example.com/avatar.jpg',
    nullable: true,
  })
  avatarUrl: string | null;

  @ApiProperty({
    description: 'Total donation amount in USD',
    example: 1500.5,
  })
  totalAmountUsd: number;

  @ApiProperty({
    description: 'Number of donations made',
    example: 5,
  })
  donationCount: number;

  @ApiProperty({
    description: 'Number of projects supported',
    example: 3,
  })
  projectsSupported: number;

  @ApiProperty({
    description: 'Whether the donor is anonymous',
    example: false,
  })
  isAnonymous: boolean;
}

export class LeaderboardResponseDto {
  @ApiProperty({
    description: 'List of top donors',
    type: [LeaderboardDonorDto],
  })
  data: LeaderboardDonorDto[];

  @ApiProperty({
    description: 'Total number of donors in the leaderboard',
    example: 100,
  })
  total: number;

  @ApiProperty({
    description: 'Current page number',
    example: 1,
  })
  page: number;

  @ApiProperty({
    description: 'Number of items per page',
    example: 100,
  })
  limit: number;

  @ApiProperty({
    description: 'Scope of the leaderboard',
    example: 'global',
    enum: ['global', 'project'],
  })
  scope: string;

  @ApiProperty({
    description: 'Project ID if project-specific leaderboard',
    example: '550e8400-e29b-41d4-a716-446655440000',
    nullable: true,
  })
  projectId: string | null;

  @ApiProperty({
    description: 'Timestamp when the leaderboard was generated',
    example: '2024-01-15T10:30:00.000Z',
  })
  generatedAt: Date;
}
