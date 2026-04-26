import { IsString, IsOptional } from 'class-validator';

export class UploadImageDto {
  @IsOptional()
  @IsString()
  altText?: string;
}

export class ImageResponseDto {
  id!: string;
  url!: string;
  altText?: string;
  fileSize!: number;
  mimeType!: string;
  fileName!: string;
  createdAt!: Date;
  updatedAt!: Date;
}

export class ImageUploadResponseDto {
  success!: boolean;
  message!: string;
  image?: ImageResponseDto;
}
