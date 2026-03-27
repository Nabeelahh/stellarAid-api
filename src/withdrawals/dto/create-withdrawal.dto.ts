import { IsUUID, IsNumber, IsNotEmpty, IsPositive, Max } from 'class-validator';

export class CreateWithdrawalDto {
  @IsUUID()
  @IsNotEmpty()
  projectId: string;

  @IsNumber()
  @IsPositive()
  @Max(999999999.9999999)
  amount: number;
}
