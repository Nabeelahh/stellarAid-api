import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ImageUploadService } from './services/image-upload.service';
import { PrismaModule } from '../../database/prisma.module';
import { EmailService } from '../users/email.service';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, ImageUploadService, EmailService],
  exports: [ProjectsService, ImageUploadService],
})
export class ProjectsModule {}
