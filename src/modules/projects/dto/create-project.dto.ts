import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUrl, Min } from 'class-validator';
import { ProjectCategory } from '../../../../generated/prisma';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsEnum(ProjectCategory)
  category!: ProjectCategory;

  @IsNumber()
  @Min(1)
  goalAmount!: number;

  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  walletAddress?: string;

  @IsOptional()
  startDate?: Date;

  @IsOptional()
  endDate?: Date;
}
