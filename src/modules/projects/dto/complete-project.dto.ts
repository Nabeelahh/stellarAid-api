import { IsOptional, IsString } from 'class-validator';

export class CompleteProjectDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
