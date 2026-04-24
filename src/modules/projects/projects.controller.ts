import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

interface JwtUser { id: string }

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
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
}
