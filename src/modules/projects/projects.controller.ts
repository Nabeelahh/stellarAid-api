import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { PauseProjectDto } from './dto/pause-project.dto';
import { ResumeProjectDto } from './dto/resume-project.dto';
import { CompleteProjectDto } from './dto/complete-project.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserRole } from '../../generated/prisma';

interface JwtUser {
  id: string;
  role: UserRole;
}

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateProjectDto) {
    return this.projectsService.create(user.id, dto);
  }

  @Get()
  findAll() {
    return this.projectsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.projectsService.findOne(id);
  }

  @Get(':id/status-history')
  getStatusHistory(@Param('id') id: string) {
    return this.projectsService.getStatusHistory(id);
  }

  @Patch(':id/pause')
  @UseGuards(JwtAuthGuard)
  pauseProject(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: PauseProjectDto,
  ) {
    return this.projectsService.pauseProject(id, user.id, user.role, dto);
  }

  @Patch(':id/resume')
  @UseGuards(JwtAuthGuard)
  resumeProject(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: ResumeProjectDto,
  ) {
    return this.projectsService.resumeProject(id, user.id, user.role, dto);
  }

  @Post(':id/complete')
  @UseGuards(JwtAuthGuard)
  completeProject(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CompleteProjectDto,
  ) {
    return this.projectsService.completeProject(id, user.id, user.role, dto);
  }
}
