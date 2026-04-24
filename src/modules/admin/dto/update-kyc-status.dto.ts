import { IsEnum, IsOptional, IsString } from 'class-validator';
import { KycStatus } from '../../../../generated/prisma';

export class UpdateKycStatusDto {
  @IsEnum(KycStatus)
  status!: KycStatus;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
