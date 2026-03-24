import { Test, TestingModule } from '@nestjs/testing';
import { ProjectCategory } from 'src/common/enums/project-category.enum';
import { ProjectStatus } from 'src/common/enums/project-status.enum';
import { ProjectSortBy } from 'src/common/enums/projects-sortBy.enum';
import { GetProjectsQueryDto } from 'src/projects/dto/get-projects-query.dto';
import { Project } from 'src/projects/entities/project.entity';
import { ProjectsController } from 'src/projects/projects.controller';
import { ProjectsService } from 'src/projects/providers/projects.service';
import { ImageUploadService } from 'src/projects/services/image-upload.service';

describe('ProjectsController', () => {
  let controller: ProjectsController;
  let service: ProjectsService;

  // Mock ProjectsService
  const mockProjectsService = {
    findAll: jest.fn(),
    findOnePublic: jest.fn(),
  };

  // Mock ImageUploadService
  const mockImageUploadService = {
    uploadImages: jest.fn(),
    getProjectImages: jest.fn(),
    deleteImage: jest.fn(),
  };

  // Mock project data
  const mockProjects: Partial<Project>[] = [
    {
      id: '550e8400-e29b-41d4-a716-446655440001',
      title: 'Education Fund',
      description: 'Supporting education for children',
      category: ProjectCategory.EDUCATION,
      status: ProjectStatus.ACTIVE,
      goalAmount: 10000,
      fundsRaised: 5000,
      imageUrl: 'https://example.com/image1.jpg',
      deadline: new Date('2025-12-31'),
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      creator: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        firstName: 'John',
        lastName: 'Doe',
        walletAddress:
          'GAA2M7F4E3C4D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8S9T0U1V2W3X4Y5Z6',
      } as any,
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440002',
      title: 'Health Initiative',
      description: 'Improving healthcare access',
      category: ProjectCategory.HEALTH,
      status: ProjectStatus.APPROVED,
      goalAmount: 25000,
      fundsRaised: 15000,
      imageUrl: null,
      deadline: new Date('2025-06-30'),
      createdAt: new Date('2024-02-01'),
      updatedAt: new Date('2024-02-01'),
      creator: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        firstName: 'John',
        lastName: 'Doe',
        walletAddress:
          'GAA2M7F4E3C4D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8S9T0U1V2W3X4Y5Z6',
      } as any,
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [
        {
          provide: ProjectsService,
          useValue: mockProjectsService,
        },
        {
          provide: ImageUploadService,
          useValue: mockImageUploadService,
        },
      ],
    }).compile();

    controller = module.get<ProjectsController>(ProjectsController);
    service = module.get<ProjectsService>(ProjectsService);

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    describe('success scenarios', () => {
      it('should return projects with default pagination values', async () => {
        const query: GetProjectsQueryDto = {};
        const serviceResponse = {
          data: mockProjects,
          total: 2,
        };

        mockProjectsService.findAll.mockResolvedValue(serviceResponse);

        const result = await controller.findAll(query);

        expect(result).toEqual({
          data: mockProjects,
          total: 2,
          limit: 10,
          offset: 0,
        });
        expect(service.findAll).toHaveBeenCalledWith(query);
        expect(service.findAll).toHaveBeenCalledTimes(1);
      });

      it('should return projects with custom limit and offset', async () => {
        const query: GetProjectsQueryDto = {
          limit: 5,
          offset: 10,
        };
        const serviceResponse = {
          data: mockProjects,
          total: 20,
        };

        mockProjectsService.findAll.mockResolvedValue(serviceResponse);

        const result = await controller.findAll(query);

        expect(result).toEqual({
          data: mockProjects,
          total: 20,
          limit: 5,
          offset: 10,
        });
        expect(service.findAll).toHaveBeenCalledWith(query);
      });

      it('should return projects with category filter', async () => {
        const query: GetProjectsQueryDto = {
          category: ProjectCategory.EDUCATION,
        };
        const filteredProjects = [mockProjects[0]];
        const serviceResponse = {
          data: filteredProjects,
          total: 1,
        };

        mockProjectsService.findAll.mockResolvedValue(serviceResponse);

        const result = await controller.findAll(query);

        expect(result.data).toEqual(filteredProjects);
        expect(result.total).toBe(1);
        expect(service.findAll).toHaveBeenCalledWith(query);
      });

      it('should return projects with status filter', async () => {
        const query: GetProjectsQueryDto = {
          status: ProjectStatus.ACTIVE,
        };
        const filteredProjects = [mockProjects[0]];
        const serviceResponse = {
          data: filteredProjects,
          total: 1,
        };

        mockProjectsService.findAll.mockResolvedValue(serviceResponse);

        const result = await controller.findAll(query);

        expect(result.data).toEqual(filteredProjects);
        expect(result.total).toBe(1);
        expect(service.findAll).toHaveBeenCalledWith(query);
      });

      it('should return projects with search filter', async () => {
        const query: GetProjectsQueryDto = {
          search: 'education',
        };
        const filteredProjects = [mockProjects[0]];
        const serviceResponse = {
          data: filteredProjects,
          total: 1,
        };

        mockProjectsService.findAll.mockResolvedValue(serviceResponse);

        const result = await controller.findAll(query);

        expect(result.data).toEqual(filteredProjects);
        expect(service.findAll).toHaveBeenCalledWith(query);
      });

      it('should return projects with sortBy filter', async () => {
        const query: GetProjectsQueryDto = {
          sortBy: ProjectSortBy.MOST_FUNDED,
        };
        const serviceResponse = {
          data: mockProjects,
          total: 2,
        };

        mockProjectsService.findAll.mockResolvedValue(serviceResponse);

        const result = await controller.findAll(query);

        expect(result.data).toEqual(mockProjects);
        expect(service.findAll).toHaveBeenCalledWith(query);
      });

      it('should return projects with all filters combined', async () => {
        const query: GetProjectsQueryDto = {
          category: ProjectCategory.HEALTH,
          status: ProjectStatus.APPROVED,
          search: 'health',
          sortBy: ProjectSortBy.NEWEST,
          limit: 20,
          offset: 5,
        };
        const filteredProjects = [mockProjects[1]];
        const serviceResponse = {
          data: filteredProjects,
          total: 1,
        };

        mockProjectsService.findAll.mockResolvedValue(serviceResponse);

        const result = await controller.findAll(query);

        expect(result).toEqual({
          data: filteredProjects,
          total: 1,
          limit: 20,
          offset: 5,
        });
        expect(service.findAll).toHaveBeenCalledWith(query);
      });

      it('should return empty array when no projects found', async () => {
        const query: GetProjectsQueryDto = {
          search: 'nonexistent',
        };
        const serviceResponse = {
          data: [],
          total: 0,
        };

        mockProjectsService.findAll.mockResolvedValue(serviceResponse);

        const result = await controller.findAll(query);

        expect(result).toEqual({
          data: [],
          total: 0,
          limit: 10,
          offset: 0,
        });
      });

      it('should pass through limit of 0 (controller does not validate)', async () => {
        const query: GetProjectsQueryDto = {
          limit: 0,
        };
        const serviceResponse = {
          data: mockProjects,
          total: 2,
        };

        mockProjectsService.findAll.mockResolvedValue(serviceResponse);

        const result = await controller.findAll(query);

        // Controller uses ?? operator which only handles null/undefined, not 0
        // 0 is a valid value that will be passed through
        expect(result.limit).toBe(0);
      });

      it('should handle offset of 0 correctly', async () => {
        const query: GetProjectsQueryDto = {
          offset: 0,
        };
        const serviceResponse = {
          data: mockProjects,
          total: 2,
        };

        mockProjectsService.findAll.mockResolvedValue(serviceResponse);

        const result = await controller.findAll(query);

        expect(result.offset).toBe(0);
      });

      it('should handle null values in query by using defaults', async () => {
        const query: GetProjectsQueryDto = {
          limit: null as any,
          offset: null as any,
        };
        const serviceResponse = {
          data: mockProjects,
          total: 2,
        };

        mockProjectsService.findAll.mockResolvedValue(serviceResponse);

        const result = await controller.findAll(query);

        expect(result.limit).toBe(10);
        expect(result.offset).toBe(0);
      });

      it('should handle undefined values in query by using defaults', async () => {
        const query: GetProjectsQueryDto = {
          limit: undefined,
          offset: undefined,
        };
        const serviceResponse = {
          data: mockProjects,
          total: 2,
        };

        mockProjectsService.findAll.mockResolvedValue(serviceResponse);

        const result = await controller.findAll(query);

        expect(result.limit).toBe(10);
        expect(result.offset).toBe(0);
      });
    });

    describe('error scenarios', () => {
      it('should propagate service errors', async () => {
        const query: GetProjectsQueryDto = {};
        const error = new Error('Database connection failed');

        mockProjectsService.findAll.mockRejectedValue(error);

        await expect(controller.findAll(query)).rejects.toThrow(
          'Database connection failed',
        );
        expect(service.findAll).toHaveBeenCalledWith(query);
      });

      it('should handle service throwing custom exception', async () => {
        const query: GetProjectsQueryDto = {};
        const customError = new Error('Custom service error');
        customError.name = 'ServiceException';

        mockProjectsService.findAll.mockRejectedValue(customError);

        await expect(controller.findAll(query)).rejects.toThrow(customError);
      });

      it('should handle service returning null data', async () => {
        const query: GetProjectsQueryDto = {};
        const serviceResponse = {
          data: null as any,
          total: 0,
        };

        mockProjectsService.findAll.mockResolvedValue(serviceResponse);

        const result = await controller.findAll(query);

        expect(result.data).toBeNull();
        expect(result.total).toBe(0);
      });

      it('should handle service returning undefined data', async () => {
        const query: GetProjectsQueryDto = {};
        const serviceResponse = {
          data: undefined as any,
          total: 0,
        };

        mockProjectsService.findAll.mockResolvedValue(serviceResponse);

        const result = await controller.findAll(query);

        expect(result.data).toBeUndefined();
        expect(result.total).toBe(0);
      });
    });

    describe('edge cases', () => {
      it('should handle very large limit values', async () => {
        const query: GetProjectsQueryDto = {
          limit: 1000,
        };
        const serviceResponse = {
          data: mockProjects,
          total: 1000,
        };

        mockProjectsService.findAll.mockResolvedValue(serviceResponse);

        const result = await controller.findAll(query);

        expect(result.limit).toBe(1000);
      });

      it('should handle very large offset values', async () => {
        const query: GetProjectsQueryDto = {
          offset: 999999,
        };
        const serviceResponse = {
          data: [],
          total: 100,
        };

        mockProjectsService.findAll.mockResolvedValue(serviceResponse);

        const result = await controller.findAll(query);

        expect(result.offset).toBe(999999);
      });

      it('should handle special characters in search', async () => {
        const query: GetProjectsQueryDto = {
          search: 'test%_special@#$',
        };
        const serviceResponse = {
          data: [],
          total: 0,
        };

        mockProjectsService.findAll.mockResolvedValue(serviceResponse);

        const result = await controller.findAll(query);

        expect(service.findAll).toHaveBeenCalledWith(query);
        expect(result.data).toEqual([]);
      });

      it('should handle all project categories', async () => {
        const categories = Object.values(ProjectCategory);

        for (const category of categories) {
          jest.clearAllMocks();

          const query: GetProjectsQueryDto = { category };
          const serviceResponse = {
            data: mockProjects,
            total: 2,
          };

          mockProjectsService.findAll.mockResolvedValue(serviceResponse);

          const result = await controller.findAll(query);

          expect(service.findAll).toHaveBeenCalledWith(query);
          expect(result.data).toEqual(mockProjects);
        }
      });

      it('should handle all project statuses', async () => {
        const statuses = Object.values(ProjectStatus);

        for (const status of statuses) {
          jest.clearAllMocks();

          const query: GetProjectsQueryDto = { status };
          const serviceResponse = {
            data: mockProjects,
            total: 2,
          };

          mockProjectsService.findAll.mockResolvedValue(serviceResponse);

          const result = await controller.findAll(query);

          expect(service.findAll).toHaveBeenCalledWith(query);
          expect(result.data).toEqual(mockProjects);
        }
      });

      it('should handle all sortBy options', async () => {
        const sortOptions = Object.values(ProjectSortBy);

        for (const sortBy of sortOptions) {
          jest.clearAllMocks();

          const query: GetProjectsQueryDto = { sortBy };
          const serviceResponse = {
            data: mockProjects,
            total: 2,
          };

          mockProjectsService.findAll.mockResolvedValue(serviceResponse);

          const result = await controller.findAll(query);

          expect(service.findAll).toHaveBeenCalledWith(query);
          expect(result.data).toEqual(mockProjects);
        }
      });

      it('should handle projects with missing optional fields', async () => {
        const query: GetProjectsQueryDto = {};
        const projectsWithMissingFields = [
          {
            id: '550e8400-e29b-41d4-a716-446655440003',
            title: 'Minimal Project',
            description: 'A project with minimal fields',
          },
        ];
        const serviceResponse = {
          data: projectsWithMissingFields,
          total: 1,
        };

        mockProjectsService.findAll.mockResolvedValue(serviceResponse);

        const result = await controller.findAll(query);

        expect(result.data).toEqual(projectsWithMissingFields);
      });
    });
  });

  describe('findOne', () => {
    it('should return detailed project by id', async () => {
      const projectId = '550e8400-e29b-41d4-a716-446655440001';
      const detailedProject = {
        ...mockProjects[0],
        donationSummary: {
          totalDonations: 2,
          totalAmount: 5000,
          uniqueDonors: 2,
        },
        progressPercentage: 50,
        recentDonations: [],
      };

      mockProjectsService.findOnePublic.mockResolvedValue(detailedProject);

      const result = await controller.findOne(projectId);

      expect(result).toEqual(detailedProject);
      expect(service.findOnePublic).toHaveBeenCalledWith(projectId);
      expect(service.findOnePublic).toHaveBeenCalledTimes(1);
    });

    it('should propagate not found error', async () => {
      const projectId = 'non-existent-id';
      const error = new Error('Project not found');

      mockProjectsService.findOnePublic.mockRejectedValue(error);

      await expect(controller.findOne(projectId)).rejects.toThrow(
        'Project not found',
      );
      expect(service.findOnePublic).toHaveBeenCalledWith(projectId);
    });
  });
});
