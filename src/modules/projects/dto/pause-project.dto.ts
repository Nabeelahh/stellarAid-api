import { IsOptional, IsString } from 'class-validator';

export class PauseProjectDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
