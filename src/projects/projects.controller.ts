import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Query,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { GetProjectsQueryDto } from './dto/get-projects-query.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { SearchProjectsDto } from './dto/search-projects.dto';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from 'src/common/enums/user-role.enum';
import { ProjectsService } from './providers/projects.service';
import { SearchService } from './services/search.service';

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly searchService: SearchService,
  ) {}

  //______________________ Endpoint to create a new project (CREATOR role required)
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CREATOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all projects with filtering and pagination' })
  @ApiOkResponse({ description: 'Projects retrieved successfully' })
  async findAll(@Query() query: GetProjectsQueryDto) {
    const { data, total } = await this.projectsService.findAll(query);
    return {
      data,
      total,
      limit: query.limit ?? 10,
      offset: query.offset ?? 0,
    };
  }

  //_____________________ Endpoint to get detailed project info by ID (public view)
  @Get(':id')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get detailed project by ID' })
  @ApiOkResponse({ description: 'Project details retrieved successfully' })
  @ApiNotFoundResponse({ description: 'Project not found' })
  async findOne(@Param('id') id: string) {
    return this.projectsService.findOnePublic(id);
  }

  //_____________________ Endpoint to create a new project (CREATOR role required)
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CREATOR)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create a new project (CREATOR role required)' })
  @ApiCreatedResponse({ description: 'Project created successfully' })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({
    description: 'Forbidden – only CREATOR role allowed',
  })
  async create(@Body() createProjectDto: CreateProjectDto, @Request() req) {
    const userId = req.user.sub;
    const project = await this.projectsService.create(createProjectDto, userId);
    return project;
  }

  //_____________________ Endpoint for enhanced search
  @Get('search')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Search projects with full-text search and filters' })
  @ApiOkResponse({ description: 'Search results retrieved successfully' })
  async searchProjects(@Query() searchDto: SearchProjectsDto) {
    const result = await this.searchService.searchProjects(searchDto);
    return {
      data: result.data,
      total: result.total,
      limit: searchDto.limit ?? 10,
      offset: searchDto.offset ?? 0,
      suggestions: result.suggestions || [],
    };
  }

  //_____________________ Endpoint for search analytics
  @Get('search/analytics')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get search analytics (ADMIN only)' })
  @ApiOkResponse({ description: 'Search analytics retrieved successfully' })
  @ApiForbiddenResponse({ description: 'Admin access required' })
  async getSearchAnalytics() {
    return await this.searchService.getSearchAnalytics();
  }
}
