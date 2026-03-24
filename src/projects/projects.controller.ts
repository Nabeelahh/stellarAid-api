import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
  Query,
  Param,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFiles,
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
  ApiConsumes,
} from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { GetProjectsQueryDto } from './dto/get-projects-query.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { DeleteImageDto } from './dto/upload-image.dto';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from 'src/common/enums/user-role.enum';
import { ProjectsService } from './providers/projects.service';
import { ImageUploadService } from './services/image-upload.service';

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly imageUploadService: ImageUploadService,
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

  //_____________________ Endpoint to upload project images
  @Post(':id/images')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CREATOR, UserRole.ADMIN)
  @UseInterceptors(FilesInterceptor('images'))
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload images to project (CREATOR or ADMIN required)' })
  @ApiCreatedResponse({ description: 'Images uploaded successfully' })
  @ApiNotFoundResponse({ description: 'Project not found' })
  @ApiForbiddenResponse({ description: 'Only creator or admin can upload images' })
  async uploadImages(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Request() req,
  ) {
    const userId = req.user.sub;
    const userRole = req.user.role;
    const images = await this.imageUploadService.uploadImages(id, files, userId, userRole);
    return { images };
  }

  //_____________________ Endpoint to get project images
  @Get(':id/images')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get project images' })
  @ApiOkResponse({ description: 'Images retrieved successfully' })
  @ApiNotFoundResponse({ description: 'Project not found' })
  async getProjectImages(@Param('id') id: string) {
    const images = await this.imageUploadService.getProjectImages(id);
    return { images };
  }

  //_____________________ Endpoint to delete project image
  @Delete(':id/images/:imageId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CREATOR, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete project image (CREATOR or ADMIN required)' })
  @ApiOkResponse({ description: 'Image deleted successfully' })
  @ApiNotFoundResponse({ description: 'Image not found' })
  @ApiForbiddenResponse({ description: 'Only creator or admin can delete images' })
  async deleteImage(
    @Param('id') id: string,
    @Param('imageId') imageId: string,
    @Request() req,
  ) {
    const userId = req.user.sub;
    const userRole = req.user.role;
    await this.imageUploadService.deleteImage(imageId, userId, userRole);
    return { message: 'Image deleted successfully' };
  }
}
