import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(creatorId: string, dto: CreateProjectDto) {
    return this.prisma.project.create({
      data: { ...dto, creatorId },
    });
  }

  async findAll() {
    return this.prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
      include: { creator: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: { creator: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }
}
