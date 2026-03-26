import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from 'src/auth/auth.controller';
import { AuthService } from 'src/auth/providers/auth.service';
import { UserRole } from 'src/common/enums/user-role.enum';
import { KYCStatus } from 'src/common/enums/kyc-status.enum';

describe('AuthController', () => {
  let authController: AuthController;
  let authService: AuthService;

  const mockUser = {
    id: 'user-id-123',
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    role: UserRole.USER,
    walletAddress: 'GABC123DEF456',
    isEmailVerified: true,
    kycStatus: KYCStatus.NONE,
  };

  const mockAuthResponse = {
    accessToken: 'jwt-token',
    refreshToken: 'refresh-token',
    user: mockUser,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            register: jest.fn(),
            login: jest.fn(),
            verifyEmail: jest.fn(),
            resendVerification: jest.fn(),
            refreshToken: jest.fn(),
          },
        },
      ],
    }).compile();

    authController = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);

    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user', async () => {
      const registerDto = {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe',
        walletAddress: 'GABC123...',
      };

      jest
        .spyOn(authService, 'register')
        .mockResolvedValue(mockAuthResponse as any);

      const result = await authController.register(registerDto);

      expect(result).toEqual(mockAuthResponse);
      expect(authService.register).toHaveBeenCalledWith(registerDto);
    });

    it('should call authService.register with correct dto', async () => {
      const registerDto = {
        email: 'newuser@example.com',
        password: 'NewPass123!',
        firstName: 'New',
        lastName: 'User',
        walletAddress: 'GXYZ789...',
      };

      jest
        .spyOn(authService, 'register')
        .mockResolvedValue(mockAuthResponse as any);

      await authController.register(registerDto);

      expect(authService.register).toHaveBeenCalledWith(registerDto);
    });
  });

  describe('login', () => {
    it('should login a user', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      const mockReq = {} as Request;

      jest.spyOn(authService, 'login').mockResolvedValue(mockAuthResponse as any);

      const result = await authController.login(loginDto, mockReq);

      expect(result).toEqual(mockAuthResponse);
      expect(authService.login).toHaveBeenCalledWith(loginDto, mockReq);
    });

    it('should call authService.login with correct dto and request', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      const mockReq = { headers: { host: 'localhost' } } as Request;

      jest.spyOn(authService, 'login').mockResolvedValue(mockAuthResponse as any);

      await authController.login(loginDto, mockReq);

      expect(authService.login).toHaveBeenCalledWith(loginDto, mockReq);
    });
  });

  describe('getProfile', () => {
    it('should return current user profile from request', async () => {
      const mockReq = { user: mockUser };

      const result = await authController.getProfile(mockReq);

      expect(result).toEqual(mockUser);
    });

    it('should return user object from request.user', async () => {
      const userWithProfile = {
        ...mockUser,
        bio: 'Test bio',
        country: 'US',
        avatarUrl: 'https://example.com/avatar.png',
      };
      const mockReq = { user: userWithProfile };

      const result = await authController.getProfile(mockReq);

      expect(result).toEqual(userWithProfile);
    });
  });

  describe('verifyEmail', () => {
    it('should verify email with valid token', async () => {
      const verifyEmailDto = {
        token: 'verification-token',
      };

      const expectedResult = { message: 'Email verified successfully' };

      jest
        .spyOn(authService, 'verifyEmail')
        .mockResolvedValue(expectedResult as any);

      const result = await authController.verifyEmail(verifyEmailDto);

      expect(result).toEqual(expectedResult);
      expect(authService.verifyEmail).toHaveBeenCalledWith(verifyEmailDto);
    });

    it('should call authService.verifyEmail with correct dto', async () => {
      const verifyEmailDto = {
        token: 'abc123def456',
      };

      jest
        .spyOn(authService, 'verifyEmail')
        .mockResolvedValue({ message: 'Email verified successfully' } as any);

      await authController.verifyEmail(verifyEmailDto);

      expect(authService.verifyEmail).toHaveBeenCalledWith(verifyEmailDto);
    });
  });

  describe('resendVerification', () => {
    it('should resend verification email', async () => {
      const resendVerificationDto = {
        email: 'test@example.com',
      };

      const expectedResult = { message: 'Verification email resent' };

      jest
        .spyOn(authService, 'resendVerification')
        .mockResolvedValue(expectedResult as any);

      const result = await authController.resendVerification(
        resendVerificationDto,
      );

      expect(result).toEqual(expectedResult);
      expect(authService.resendVerification).toHaveBeenCalledWith(
        resendVerificationDto,
      );
    });

    it('should call authService.resendVerification with correct dto', async () => {
      const resendVerificationDto = {
        email: 'newuser@example.com',
      };

      jest
        .spyOn(authService, 'resendVerification')
        .mockResolvedValue({ message: 'Verification email resent' } as any);

      await authController.resendVerification(resendVerificationDto);

      expect(authService.resendVerification).toHaveBeenCalledWith(
        resendVerificationDto,
      );
    });
  });

  describe('refreshToken', () => {
    it('should refresh access token', async () => {
      const refreshTokenDto = {
        refreshToken: 'valid-refresh-token',
      };

      jest
        .spyOn(authService, 'refreshToken')
        .mockResolvedValue(mockAuthResponse as any);

      const result = await authController.refreshToken(refreshTokenDto);

      expect(result).toEqual(mockAuthResponse);
      expect(authService.refreshToken).toHaveBeenCalledWith(refreshTokenDto);
    });

    it('should call authService.refreshToken with correct dto', async () => {
      const refreshTokenDto = {
        refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      };

      jest
        .spyOn(authService, 'refreshToken')
        .mockResolvedValue(mockAuthResponse as any);

      await authController.refreshToken(refreshTokenDto);

      expect(authService.refreshToken).toHaveBeenCalledWith(refreshTokenDto);
    });

    it('should return new auth response with access and refresh tokens', async () => {
      const refreshTokenDto = {
        refreshToken: 'expired-refresh-token',
      };

      const newTokens = {
        accessToken: 'new-jwt-token',
        refreshToken: 'new-refresh-token',
        user: mockUser,
      };

      jest
        .spyOn(authService, 'refreshToken')
        .mockResolvedValue(newTokens as any);

      const result = await authController.refreshToken(refreshTokenDto);

      expect(result).toEqual(newTokens);
      expect(result.accessToken).toBe('new-jwt-token');
      expect(result.refreshToken).toBe('new-refresh-token');
    });
  });
});
