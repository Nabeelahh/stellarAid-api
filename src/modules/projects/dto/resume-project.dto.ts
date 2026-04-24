import { IsOptional, IsString } from 'class-validator';

export class ResumeProjectDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
