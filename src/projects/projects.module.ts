import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { Project } from './entities/project.entity';
import { Donation } from './entities/donation.entity';
import { ProjectImage } from './entities/project-image.entity';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './providers/projects.service';
import { ImageUploadService } from './services/image-upload.service';
import { FileUploadService } from '../common/services/file-upload.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Project, Donation, ProjectImage]),
    MulterModule.register({
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
        files: 10, // Max 10 files per request
      },
    }),
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService, ImageUploadService, FileUploadService],
  exports: [ProjectsService, ImageUploadService],
})
export class ProjectsModule {}
