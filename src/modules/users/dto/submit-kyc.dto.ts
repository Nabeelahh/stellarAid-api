import { IsString, IsUrl } from 'class-validator';

export class SubmitKycDto {
  @IsString()
  @IsUrl()
  documentUrl!: string;
}
