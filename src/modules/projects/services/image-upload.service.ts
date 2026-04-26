import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class ImageUploadService {
  private readonly allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
  private readonly maxFileSize = 5 * 1024 * 1024; // 5MB in bytes

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  validateFile(file: Express.Multer.File): void {
    // Check file type
    if (!this.allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Allowed types: ${this.allowedMimeTypes.join(', ')}`,
      );
    }

    // Check file size
    if (file.size > this.maxFileSize) {
      throw new BadRequestException(
        `File size too large. Maximum size: ${this.maxFileSize / 1024 / 1024}MB`,
      );
    }
  }

  async uploadImage(
    projectId: string,
    file: Express.Multer.File,
    altText?: string,
  ): Promise<any> {
    // Validate file
    this.validateFile(file);

    // For now, we'll store files locally or use a mock upload
    // In production, you would upload to S3, Supabase, or other cloud storage
    const imageUrl = await this.uploadToCloudStorage(file);

    // Store image metadata in database
    const image = await this.prisma.projectImage.create({
      data: {
        projectId,
        url: imageUrl,
        altText,
        fileSize: file.size,
        mimeType: file.mimetype,
        fileName: file.originalname,
      },
    });

    return image;
  }

  private async uploadToCloudStorage(file: Express.Multer.File): Promise<string> {
    // This is a mock implementation
    // In production, you would implement actual cloud storage upload
    // Examples:
    // - AWS S3: Using @aws-sdk/client-s3
    // - Supabase: Using @supabase/supabase-js
    // - Cloudinary: Using cloudinary
    
    // For now, return a mock URL
    const mockUrl = `https://mock-storage.example.com/images/${file.originalname}`;
    
    // TODO: Implement actual cloud storage upload
    // Example S3 implementation:
    /*
    const s3 = new S3Client({
      region: this.configService.get('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY'),
      },
    });

    const uploadResult = await s3.send(new PutObjectCommand({
      Bucket: this.configService.get('AWS_S3_BUCKET'),
      Key: `projects/${file.originalname}`,
      Body: file.buffer,
      ContentType: file.mimetype,
    }));

    return `https://${this.configService.get('AWS_S3_BUCKET')}.s3.amazonaws.com/projects/${file.originalname}`;
    */

    return mockUrl;
  }

  async getProjectImages(projectId: string) {
    return this.prisma.projectImage.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteImage(projectId: string, imageId: string): Promise<void> {
    // Verify the image belongs to the project
    const image = await this.prisma.projectImage.findFirst({
      where: {
        id: imageId,
        projectId,
      },
    });

    if (!image) {
      throw new BadRequestException('Image not found or does not belong to this project');
    }

    // Delete from cloud storage (mock implementation)
    await this.deleteFromCloudStorage(image.url);

    // Delete from database
    await this.prisma.projectImage.delete({
      where: { id: imageId },
    });
  }

  private async deleteFromCloudStorage(_url: string): Promise<void> {
    // TODO: Implement actual cloud storage deletion
    // Example S3 implementation:
    /*
    const key = url.split('/').pop();
    await s3.send(new DeleteObjectCommand({
      Bucket: this.configService.get('AWS_S3_BUCKET'),
      Key: `projects/${key}`,
    }));
    */
  }
}
