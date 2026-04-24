import { IsString, IsOptional, MaxLength, MinLength, Matches } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @IsOptional()
  @IsString()
  @Matches(
    /^(https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp))|^data:image\/(png|jpeg|gif|webp);base64,/i,
    { message: 'Avatar must be a valid URL or base64 encoded image' },
  )
  avatar?: string;

  @IsOptional()
  @IsString()
  @Matches(/^G[A-Z0-9]{5,}$/, { message: 'Invalid Stellar wallet address format' })
  walletAddress?: string;
}
