import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class UploadImageDto {
  @IsArray()
  files: Express.Multer.File[];
}

export class ImageFileDto {
  @IsString()
  @MaxLength(255)
  filename: string;

  @IsString()
  @MaxLength(100)
  mimeType: string;

  @Transform(({ value }) => parseInt(value))
  size: number;
}

export class DeleteImageDto {
  @IsString()
  imageId: string;
}
