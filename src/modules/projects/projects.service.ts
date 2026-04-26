import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { PauseProjectDto } from './dto/pause-project.dto';
import { ResumeProjectDto } from './dto/resume-project.dto';
import { CompleteProjectDto } from './dto/complete-project.dto';
import { ProjectStatus, UserRole, AuditActionType } from '../../../generated/prisma';
import { validateStatusTransition, isProjectAcceptingDonations } from './utils/status-transition.validator';
import { EmailService } from '../users/email.service';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async create(creatorId: string, dto: CreateProjectDto) {
    const project = await this.prisma.project.create({
      data: {
        ...dto,
        creatorId,
        goalAmount: dto.goalAmount,
      },
      include: {
        creator: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return project;
  }

  async findAll() {
    return this.prisma.project.findMany({
      include: {
        creator: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        images: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        creator: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        images: true,
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  private async checkAuthorization(
    projectId: string,
    userId: string,
    userRole: UserRole,
  ): Promise<{ project: any; isCreator: boolean; isAdmin: boolean }> {
    const project = await this.findOne(projectId);
    const isCreator = project.creatorId === userId;
    const isAdmin = userRole === UserRole.ADMIN;

    if (!isCreator && !isAdmin) {
      throw new ForbiddenException('You are not authorized to perform this action');
    }

    return { project, isCreator, isAdmin };
  }

  
  async pauseProject(
    projectId: string,
    userId: string,
    userRole: UserRole,
    dto: PauseProjectDto,
  ) {
    const { project } = await this.checkAuthorization(projectId, userId, userRole);

    // Validate status transition (ACTIVE -> PAUSED)
    validateStatusTransition(project.status, ProjectStatus.PAUSED);

    const updatedProject = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.PAUSED,
        pausedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Record status history
    await this.prisma.projectStatusHistory.create({
      data: {
        projectId,
        oldStatus: project.status,
        newStatus: ProjectStatus.PAUSED,
        reason: dto?.reason || 'Project paused',
      },
    });

    return updatedProject;
  }

  async resumeProject(
    projectId: string,
    userId: string,
    userRole: UserRole,
    dto: ResumeProjectDto,
  ) {
    const { project } = await this.checkAuthorization(projectId, userId, userRole);

    // Validate status transition (PAUSED -> ACTIVE)
    validateStatusTransition(project.status, ProjectStatus.ACTIVE);

    const updatedProject = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.ACTIVE,
        pausedAt: null,
        updatedAt: new Date(),
      },
    });

    // Record status history
    await this.prisma.projectStatusHistory.create({
      data: {
        projectId,
        oldStatus: project.status,
        newStatus: ProjectStatus.ACTIVE,
        reason: dto?.reason || 'Project resumed',
      },
    });

    return updatedProject;
  }

  async completeProject(
    projectId: string,
    userId: string,
    userRole: UserRole,
    dto: CompleteProjectDto,
  ) {
    const { project } = await this.checkAuthorization(projectId, userId, userRole);

    // Validate status transition (ACTIVE -> COMPLETED)
    validateStatusTransition(project.status, ProjectStatus.COMPLETED);

    const updatedProject = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.COMPLETED,
        updatedAt: new Date(),
      },
    });

    // Record status history
    await this.prisma.projectStatusHistory.create({
      data: {
        projectId,
        oldStatus: project.status,
        newStatus: ProjectStatus.COMPLETED,
        reason: dto?.reason || 'Project completed',
      },
    });

    return updatedProject;
  }

  async canAcceptDonations(projectId: string): Promise<boolean> {
    const project = await this.findOne(projectId);
    return isProjectAcceptingDonations(project.status);
  }

  async getStatusHistory(projectId: string) {
    await this.findOne(projectId); // Verify project exists

    return this.prisma.projectStatusHistory.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approveProject(projectId: string, adminId: string, remarks?: string) {
    const project = await this.findOne(projectId);

    // Validate status transition (PENDING -> APPROVED)
    if (project.status !== ProjectStatus.PENDING) {
      throw new BadRequestException(
        `Cannot approve project in ${project.status} status. Project must be in PENDING status`,
      );
    }

    // Update project status atomically
    const updatedProject = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.APPROVED,
        approvedAt: new Date(),
        updatedAt: new Date(),
      },
      include: { creator: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });

    // Record status history
    await this.prisma.projectStatusHistory.create({
      data: {
        projectId,
        oldStatus: project.status,
        newStatus: ProjectStatus.APPROVED,
        reason: 'Project approved by admin',
      },
    });

    // Record audit log
    await this.createAuditLog(
      adminId,
      AuditActionType.PROJECT_APPROVED,
      projectId,
      remarks || 'Project approved',
    );

    // Send email notification to creator
    await this.emailService.sendProjectApprovalEmail(
      updatedProject.creator.email,
      updatedProject.creator.firstName || '',
      updatedProject.title,
    );

    return updatedProject;
  }

  async rejectProject(projectId: string, adminId: string, rejectionReason: string) {
    const project = await this.findOne(projectId);

    // Validate status transition (PENDING -> REJECTED)
    if (project.status !== ProjectStatus.PENDING) {
      throw new BadRequestException(
        `Cannot reject project in ${project.status} status. Project must be in PENDING status`,
      );
    }

    // Update project status atomically
    const updatedProject = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.REJECTED,
        rejectedAt: new Date(),
        rejectionReason,
        updatedAt: new Date(),
      },
      include: { creator: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });

    // Record status history
    await this.prisma.projectStatusHistory.create({
      data: {
        projectId,
        oldStatus: project.status,
        newStatus: ProjectStatus.REJECTED,
        reason: rejectionReason,
      },
    });

    // Record audit log
    await this.createAuditLog(
      adminId,
      AuditActionType.PROJECT_REJECTED,
      projectId,
      `Project rejected: ${rejectionReason}`,
    );

    // Send email notification to creator
    await this.emailService.sendProjectRejectionEmail(
      updatedProject.creator.email,
      updatedProject.creator.firstName || '',
      updatedProject.title,
    );

    return updatedProject;
  }

  private async createAuditLog(
    adminId: string,
    action: AuditActionType,
    projectId?: string,
    remarks?: string,
    userId?: string,
  ) {
    await this.prisma.auditLog.create({
      data: {
        action,
        adminId,
        projectId,
        userId,
        remarks,
      },
    });
  }
}
