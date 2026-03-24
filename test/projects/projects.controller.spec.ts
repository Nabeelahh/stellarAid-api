import { Test, TestingModule } from '@nestjs/testing';
import { ProjectCategory } from 'src/common/enums/project-category.enum';
import { ProjectStatus } from 'src/common/enums/project-status.enum';
import { ProjectSortBy } from 'src/common/enums/projects-sortBy.enum';
import { GetProjectsQueryDto } from 'src/projects/dto/get-projects-query.dto';
import { Project } from 'src/projects/entities/project.entity';
import { ProjectsController } from 'src/projects/projects.controller';
import { ProjectsService } from 'src/projects/providers/projects.service';
import { SearchService } from 'src/projects/services/search.service';

describe('ProjectsController', () => {
  let controller: ProjectsController;
  let service: ProjectsService;

  // Mock ProjectsService
  const mockProjectsService = {
    findAll: jest.fn(),
    findOnePublic: jest.fn(),
  };

  // Mock SearchService
  const mockSearchService = {
    searchProjects: jest.fn(),
    getSearchAnalytics: jest.fn(),
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
      deadline: new Date('2024-12-31'),
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      imageUrl: 'https://example.com/image1.jpg',
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
      title: 'Healthcare Initiative',
      description: 'Providing medical supplies to underserved communities',
      category: ProjectCategory.HEALTHCARE,
      status: ProjectStatus.APPROVED,
      goalAmount: 15000,
      fundsRaised: 8000,
      deadline: new Date('2024-11-30'),
      createdAt: new Date('2024-01-15'),
      updatedAt: new Date('2024-01-15'),
      imageUrl: 'https://example.com/image2.jpg',
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
          provide: SearchService,
          useValue: mockSearchService,
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
        const expectedData = {
          data: mockProjects,
          total: 2,
          limit: 10,
          offset: 0,
        };

        mockProjectsService.findAll.mockResolvedValue({
          data: mockProjects,
          total: 2,
        });

        const result = await controller.findAll(query);

        expect(result).toEqual(expectedData);
        expect(mockProjectsService.findAll).toHaveBeenCalledWith(query);
      });

      it('should return projects with custom pagination values', async () => {
        const query: GetProjectsQueryDto = {
          limit: 5,
          offset: 1,
        };
        const expectedData = {
          data: mockProjects,
          total: 2,
          limit: 5,
          offset: 1,
        };

        mockProjectsService.findAll.mockResolvedValue({
          data: mockProjects,
          total: 2,
        });

        const result = await controller.findAll(query);

        expect(result).toEqual(expectedData);
        expect(mockProjectsService.findAll).toHaveBeenCalledWith(query);
      });

      it('should handle empty project list', async () => {
        const query: GetProjectsQueryDto = {};
        const expectedData = {
          data: [],
          total: 0,
          limit: 10,
          offset: 0,
        };

        mockProjectsService.findAll.mockResolvedValue({
          data: [],
          total: 0,
        });

        const result = await controller.findAll(query);

        expect(result).toEqual(expectedData);
      });
    });

    describe('error scenarios', () => {
      it('should handle service errors gracefully', async () => {
        const query: GetProjectsQueryDto = {};
        const error = new Error('Service error');

        mockProjectsService.findAll.mockRejectedValue(error);

        await expect(controller.findAll(query)).rejects.toThrow('Service error');
      });
    });
  });

  describe('findOne', () => {
    describe('success scenarios', () => {
      it('should return a single project by ID', async () => {
        const projectId = '550e8400-e29b-41d4-a716-446655440001';
        const expectedProject = mockProjects[0];

        mockProjectsService.findOnePublic.mockResolvedValue(expectedProject);

        const result = await controller.findOne(projectId);

        expect(result).toEqual(expectedProject);
        expect(mockProjectsService.findOnePublic).toHaveBeenCalledWith(projectId);
      });
    });

    describe('error scenarios', () => {
      it('should propagate not found error', async () => {
        const projectId = 'non-existent-id';
        const error = new Error('Project not found');

        mockProjectsService.findOnePublic.mockRejectedValue(error);

        await expect(controller.findOne(projectId)).rejects.toThrow('Project not found');
      });

      it('should handle service errors gracefully', async () => {
        const projectId = '550e8400-e29b-41d4-a716-446655440001';
        const error = new Error('Service error');

        mockProjectsService.findOnePublic.mockRejectedValue(error);

        await expect(controller.findOne(projectId)).rejects.toThrow('Service error');
      });
    });
  });

  describe('searchProjects', () => {
    describe('success scenarios', () => {
      it('should return search results with suggestions', async () => {
        const searchDto = {
          search: 'education',
          limit: 10,
          offset: 0,
        };
        const expectedResults = {
          data: mockProjects,
          total: 1,
          suggestions: ['Education Support', 'Learning Fund'],
        };

        mockSearchService.searchProjects.mockResolvedValue(expectedResults);

        const result = await controller.searchProjects(searchDto);

        expect(result).toEqual({
          data: expectedResults.data,
          total: expectedResults.total,
          limit: 10,
          offset: 0,
          suggestions: expectedResults.suggestions,
        });
        expect(mockSearchService.searchProjects).toHaveBeenCalledWith(searchDto);
      });

      it('should return search results without suggestions', async () => {
        const searchDto = {
          category: ProjectCategory.HEALTHCARE,
          limit: 5,
          offset: 0,
        };
        const expectedResults = {
          data: [mockProjects[1]],
          total: 1,
        };

        mockSearchService.searchProjects.mockResolvedValue(expectedResults);

        const result = await controller.searchProjects(searchDto);

        expect(result).toEqual({
          data: expectedResults.data,
          total: expectedResults.total,
          limit: 5,
          offset: 0,
          suggestions: [],
        });
      });
    });

    describe('error scenarios', () => {
      it('should handle search service errors', async () => {
        const searchDto = { search: 'test' };
        const error = new Error('Search service error');

        mockSearchService.searchProjects.mockRejectedValue(error);

        await expect(controller.searchProjects(searchDto)).rejects.toThrow('Search service error');
      });
    });
  });

  describe('getSearchAnalytics', () => {
    describe('success scenarios', () => {
      it('should return search analytics', async () => {
        const expectedAnalytics = {
          totalProjects: 100,
          categoryDistribution: {
            [ProjectCategory.EDUCATION]: 40,
            [ProjectCategory.HEALTHCARE]: 30,
            [ProjectCategory.ENVIRONMENT]: 30,
          },
          statusDistribution: {
            [ProjectStatus.APPROVED]: 60,
            [ProjectStatus.ACTIVE]: 40,
          },
          averageGoal: 10000,
          averageRaised: 5000,
        };

        mockSearchService.getSearchAnalytics.mockResolvedValue(expectedAnalytics);

        const result = await controller.getSearchAnalytics();

        expect(result).toEqual(expectedAnalytics);
        expect(mockSearchService.getSearchAnalytics).toHaveBeenCalled();
      });
    });

    describe('error scenarios', () => {
      it('should handle analytics service errors', async () => {
        const error = new Error('Analytics service error');

        mockSearchService.getSearchAnalytics.mockRejectedValue(error);

        await expect(controller.getSearchAnalytics()).rejects.toThrow('Analytics service error');
      });
    });
  });
});
