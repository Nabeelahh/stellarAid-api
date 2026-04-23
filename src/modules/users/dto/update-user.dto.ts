import { IsString, IsOptional, IsLength, Matches, IsIn } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @IsLength(1, 100, {
    message: 'First name must be between 1 and 100 characters',
  })
  firstName?: string;

  @IsOptional()
  @IsString()
  @IsLength(1, 100, {
    message: 'Last name must be between 1 and 100 characters',
  })
  lastName?: string;

  @IsOptional()
  @IsString()
  @IsLength(2, 100, { message: 'Country must be between 2 and 100 characters' })
  country?: string;

  @IsOptional()
  @IsString()
  @IsLength(0, 500, { message: 'Bio must be at most 500 characters' })
  bio?: string;

  @IsOptional()
  @IsString()
  @Matches(
    /^(https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp))|^data:image\/(png|jpeg|gif|webp);base64,/i,
    {
      message: 'Avatar must be a valid URL or base64 encoded image',
    },
  )
  avatar?: string;

  @IsOptional()
  @IsString()
  @Matches(/^G[A-Z0-9]{5,}$/, {
    message: 'Invalid Stellar wallet address format',
  })
  walletAddress?: string;
}
