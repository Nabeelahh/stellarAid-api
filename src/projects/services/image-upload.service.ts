import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from '../entities/project.entity';
import { ProjectImage } from '../entities/project-image.entity';
import { FileUploadService } from '../../common/services/file-upload.service';

@Injectable()
export class ImageUploadService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(ProjectImage)
    private readonly projectImageRepository: Repository<ProjectImage>,
    private readonly fileUploadService: FileUploadService,
  ) {}

  async uploadImages(
    projectId: string,
    files: Express.Multer.File[],
    userId: string,
    userRole: string,
  ): Promise<ProjectImage[]> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
      relations: ['creator'],
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Check if user is creator or admin
    const isCreator = project.creatorId === userId;
    const isAdmin = userRole === 'admin';

    if (!isCreator && !isAdmin) {
      throw new ForbiddenException('Only creator or admin can upload images');
    }

    const uploadedImages: ProjectImage[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const imageUrl = await this.fileUploadService.uploadFile(file, projectId);

      const projectImage = this.projectImageRepository.create({
        url: imageUrl,
        filename: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        order: i,
        projectId,
      });

      uploadedImages.push(await this.projectImageRepository.save(projectImage));
    }

    return uploadedImages;
  }

  async deleteImage(
    imageId: string,
    userId: string,
    userRole: string,
  ): Promise<void> {
    const image = await this.projectImageRepository.findOne({
      where: { id: imageId },
      relations: ['project', 'project.creator'],
    });

    if (!image) {
      throw new NotFoundException('Image not found');
    }

    // Check if user is creator or admin
    const isCreator = image.project.creatorId === userId;
    const isAdmin = userRole === 'admin';

    if (!isCreator && !isAdmin) {
      throw new ForbiddenException('Only creator or admin can delete images');
    }

    // Delete from S3
    await this.fileUploadService.deleteFile(image.url);

    // Delete from database
    await this.projectImageRepository.remove(image);
  }

  async getProjectImages(projectId: string): Promise<ProjectImage[]> {
    return this.projectImageRepository.find({
      where: { projectId },
      order: { order: 'ASC' },
    });
  }
}
