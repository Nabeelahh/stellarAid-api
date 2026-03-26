import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../../src/auth/providers/auth.service';
import { User } from '../../src/users/entities/user.entity';
import { UserRole } from '../../src/common/enums/user-role.enum';
import { KYCStatus } from '../../src/common/enums/kyc-status.enum';
import {
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';


jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

// Mock crypto
jest.mock('crypto', () => ({
  randomBytes: jest.fn().mockReturnValue({
    toString: jest.fn().mockReturnValue('mock-token'),
  }),
}));

describe('AuthService', () => {
  let authService: AuthService;
  let userRepository: jest.Mocked<Repository<User>>;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;

  const mockUser: Partial<User> = {
    id: 'user-id-123',
    email: 'test@example.com',
    password: 'hashedPassword',
    firstName: 'John',
    lastName: 'Doe',
    role: UserRole.USER,
    walletAddress: 'GABC123DEF456',
    isEmailVerified: false,
    refreshTokenHash: null,
    kycStatus: KYCStatus.NONE,
    kycDocumentUrl: null,
    kycSubmittedAt: null,
    kycVerifiedAt: null,
    kycRejectionReason: null,
  };

  beforeEach(async () => {
    const mockUserRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const mockJwtService = {
      signAsync: jest.fn(),
      verify: jest.fn(),
    };

    const mockConfigService = {
      getOrThrow: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    userRepository = module.get(getRepositoryToken(User));
    jwtService = module.get<JwtService>(JwtService);
    configService = module.get<ConfigService>(ConfigService);

    // Default config mocks
    configService.getOrThrow.mockImplementation((key: string) => {
      if (key === 'jwtSecret') return 'test-jwt-secret';
      if (key === 'jwtRefreshSecret') return 'test-jwt-refresh-secret';
      return null;
    });

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  describe('register', () => {
    const registerDto = {
      email: 'newuser@example.com',
      password: 'Password123!',
      firstName: 'New',
      lastName: 'User',
      walletAddress: 'GXYZ789...',
    };

    it('should successfully register a new user', async () => {
      userRepository.findOne.mockResolvedValue(null);
      userRepository.create.mockReturnValue(mockUser as User);
      userRepository.save.mockResolvedValue(mockUser as User);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedPassword');
      jwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');
      (bcrypt.hash as jest.Mock).mockResolvedValue('refresh-hash');

      const result = await authService.register(registerDto);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        firstName: mockUser.firstName,
        lastName: mockUser.lastName,
        role: mockUser.role,
        walletAddress: mockUser.walletAddress,
        isEmailVerified: mockUser.isEmailVerified,
      });
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { email: registerDto.email },
      });
      expect(bcrypt.hash).toHaveBeenCalled();
    });

    it('should throw ConflictException if email already exists', async () => {
      userRepository.findOne.mockResolvedValue(mockUser as User);

      await expect(authService.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { email: registerDto.email },
      });
    });
  });

  describe('login', () => {
    const loginDto = {
      email: 'test@example.com',
      password: 'Password123!',
    };

    it('should successfully login a user with valid credentials', async () => {
      userRepository.findOne.mockResolvedValue(mockUser as User);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');
      (bcrypt.hash as jest.Mock).mockResolvedValue('refresh-hash');

      const result = await authService.login(loginDto);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.email).toBe(loginDto.email);
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { email: loginDto.email },
      });
    });

    it('should throw UnauthorizedException if user not found', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(authService.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if password is invalid', async () => {
      userRepository.findOne.mockResolvedValue(mockUser as User);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(authService.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('generateTokens', () => {
    it('should generate access and refresh tokens for a user', async () => {
      userRepository.save.mockResolvedValue(mockUser as User);
      jwtService.signAsync
        .mockResolvedValueOnce('new-access-token')
        .mockResolvedValueOnce('new-refresh-token');
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-refresh-hash');

      const result = await authService.generateTokens(mockUser as User);

      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
      expect(result.user).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        firstName: mockUser.firstName,
        lastName: mockUser.lastName,
        role: mockUser.role,
        walletAddress: mockUser.walletAddress,
        isEmailVerified: mockUser.isEmailVerified,
      });
    });
  });

  describe('validateUser', () => {
    const jwtPayload = {
      sub: 'user-id-123',
      email: 'test@example.com',
      role: UserRole.USER,
    };

    it('should return user if valid payload', async () => {
      userRepository.findOne.mockResolvedValue(mockUser as User);

      const result = await authService.validateUser(jwtPayload);

      expect(result).toEqual(mockUser);
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: jwtPayload.sub },
      });
    });

    it('should throw UnauthorizedException if user not found', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(authService.validateUser(jwtPayload)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('verifyEmail', () => {
    const verifyEmailDto = {
      token: 'verification-token',
    };

    it('should successfully verify email with valid token', async () => {
      const userWithToken = {
        ...mockUser,
        emailVerificationToken: 'verification-token',
        emailVerificationTokenExpiry: new Date(Date.now() + 3600000),
      };
      userRepository.findOne.mockResolvedValue(userWithToken as User);
      userRepository.save.mockResolvedValue(userWithToken as User);

      const result = await authService.verifyEmail(verifyEmailDto);

      expect(result.message).toBe('Email verified successfully');
      expect(userRepository.save).toHaveBeenCalled();
    });

    it('should throw BadRequestException for invalid token', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(authService.verifyEmail(verifyEmailDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for expired token', async () => {
      const userWithExpiredToken = {
        ...mockUser,
        emailVerificationToken: 'verification-token',
        emailVerificationTokenExpiry: new Date(Date.now() - 3600000),
      };
      userRepository.findOne.mockResolvedValue(userWithExpiredToken as User);

      await expect(authService.verifyEmail(verifyEmailDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('resendVerification', () => {
    const resendVerificationDto = {
      email: 'test@example.com',
    };

    it('should resend verification email for unverified user', async () => {
      const unverifiedUser = {
        ...mockUser,
        isEmailVerified: false,
      };
      userRepository.findOne.mockResolvedValue(unverifiedUser as User);

      const result = await authService.resendVerification(resendVerificationDto);

      expect(result.message).toBe('Verification email resent');
    });

    it('should throw NotFoundException if user not found', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        authService.resendVerification(resendVerificationDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if email already verified', async () => {
      const verifiedUser = {
        ...mockUser,
        isEmailVerified: true,
      };
      userRepository.findOne.mockResolvedValue(verifiedUser as User);

      await expect(
        authService.resendVerification(resendVerificationDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('forgotPassword', () => {
    it('should return success message even if user not found (security)', async () => {
      userRepository.findOne.mockResolvedValue(null);

      const result = await authService.forgotPassword('nonexistent@example.com');

      expect(result.message).toBe(
        'If an account with that email exists, a reset link has been sent',
      );
    });

    it('should process forgot password for existing user', async () => {
      userRepository.findOne.mockResolvedValue(mockUser as User);
      userRepository.save.mockResolvedValue(mockUser as User);
      (bcrypt.hash as jest.Mock).mockResolvedValue('validator-hash');

      const result = await authService.forgotPassword('test@example.com');

      expect(result.message).toBe(
        'If an account with that email exists, a reset link has been sent',
      );
      expect(userRepository.save).toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    const validToken = 'selector.validator';

    it('should successfully reset password with valid token', async () => {
      const userWithResetToken = {
        ...mockUser,
        resetPasswordTokenSelector: 'selector',
        resetPasswordTokenHash: 'validator-hash',
        resetPasswordTokenExpiry: new Date(Date.now() + 3600000),
      };
      userRepository.findOne.mockResolvedValue(userWithResetToken as User);
      userRepository.save.mockResolvedValue(userWithResetToken as User);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed-password');

      const result = await authService.resetPassword(
        validToken,
        'NewPassword123!',
      );

      expect(result.message).toBe('Password reset successfully');
      expect(userRepository.save).toHaveBeenCalled();
    });

    it('should throw BadRequestException for invalid token format', async () => {
      await expect(
        authService.resetPassword('invalid-token', 'NewPassword123!'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if user not found', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        authService.resetPassword(validToken, 'NewPassword123!'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for expired token', async () => {
      const userWithExpiredToken = {
        ...mockUser,
        resetPasswordTokenSelector: 'selector',
        resetPasswordTokenHash: 'validator-hash',
        resetPasswordTokenExpiry: new Date(Date.now() - 3600000),
      };
      userRepository.findOne.mockResolvedValue(userWithExpiredToken as User);

      await expect(
        authService.resetPassword(validToken, 'NewPassword123!'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid token hash', async () => {
      const userWithToken = {
        ...mockUser,
        resetPasswordTokenSelector: 'selector',
        resetPasswordTokenHash: 'validator-hash',
        resetPasswordTokenExpiry: new Date(Date.now() + 3600000),
      };
      userRepository.findOne.mockResolvedValue(userWithToken as User);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        authService.resetPassword(validToken, 'NewPassword123!'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('changePassword', () => {
    const changePasswordDto = {
      currentPassword: 'OldPassword123!',
      newPassword: 'NewPassword123!',
    };

    it('should successfully change password with valid current password', async () => {
      userRepository.findOne.mockResolvedValue(mockUser as User);
      userRepository.save.mockResolvedValue(mockUser as User);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed-password');

      const result = await authService.changePassword(
        mockUser.id,
        changePasswordDto,
      );

      expect(result.message).toBe('Password changed successfully');
      expect(userRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if user not found', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        authService.changePassword('nonexistent-id', changePasswordDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw UnauthorizedException for incorrect current password', async () => {
      userRepository.findOne.mockResolvedValue(mockUser as User);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        authService.changePassword(mockUser.id, changePasswordDto),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('submitKYC', () => {
    const submitKycDto = {
      documentUrl: 'https://example.com/kyc/doc.pdf',
    };

    it('should successfully submit KYC documents', async () => {
      userRepository.findOne.mockResolvedValue(mockUser as User);
      userRepository.save.mockResolvedValue(mockUser as User);

      const result = await authService.submitKYC(mockUser.id, submitKycDto);

      expect(result.message).toBe('KYC documents submitted for review');
      expect(userRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if user not found', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        authService.submitKYC('nonexistent-id', submitKycDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateKYCStatus', () => {
    const updateKycDto = {
      status: KYCStatus.APPROVED,
      rejectionReason: undefined,
    };

    it('should successfully update KYC status to APPROVED', async () => {
      userRepository.findOne.mockResolvedValue(mockUser as User);
      userRepository.save.mockResolvedValue(mockUser as User);

      const result = await authService.updateKYCStatus(mockUser.id, updateKycDto);

      expect(result.message).toBe('KYC status updated to approved');
      expect(userRepository.save).toHaveBeenCalled();
    });

    it('should successfully update KYC status to REJECTED with reason', async () => {
      const updateKycRejectedDto = {
        status: KYCStatus.REJECTED,
        rejectionReason: 'Document unclear',
      };
      userRepository.findOne.mockResolvedValue(mockUser as User);
      userRepository.save.mockResolvedValue(mockUser as User);

      const result = await authService.updateKYCStatus(
        mockUser.id,
        updateKycRejectedDto,
      );

      expect(result.message).toBe('KYC status updated to rejected');
      expect(userRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if user not found', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        authService.updateKYCStatus('nonexistent-id', updateKycDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('refreshToken', () => {
    const refreshTokenDto = {
      refreshToken: 'valid-refresh-token',
    };

    const jwtPayload = {
      sub: 'user-id-123',
      email: 'test@example.com',
      role: UserRole.USER,
    };

    it('should successfully refresh tokens with valid refresh token', async () => {
      const userWithRefreshToken = {
        ...mockUser,
        refreshTokenHash: 'stored-refresh-hash',
      };
      userRepository.findOne.mockResolvedValue(userWithRefreshToken as User);
      jwtService.verify.mockReturnValue(jwtPayload);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jwtService.signAsync
        .mockResolvedValueOnce('new-access-token')
        .mockResolvedValueOnce('new-refresh-token');
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-refresh-hash');
      userRepository.save.mockResolvedValue(userWithRefreshToken as User);

      const result = await authService.refreshToken(refreshTokenDto);

      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
    });

    it('should throw UnauthorizedException if user not found', async () => {
      jwtService.verify.mockReturnValue(jwtPayload);
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        authService.refreshToken(refreshTokenDto),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if no refresh token hash stored', async () => {
      const userWithoutHash = {
        ...mockUser,
        refreshTokenHash: null,
      };
      jwtService.verify.mockReturnValue(jwtPayload);
      userRepository.findOne.mockResolvedValue(userWithoutHash as User);

      await expect(
        authService.refreshToken(refreshTokenDto),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for invalid refresh token', async () => {
      jwtService.verify.mockReturnValue(jwtPayload);
      userRepository.findOne.mockResolvedValue(mockUser as User);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        authService.refreshToken(refreshTokenDto),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for expired JWT token', async () => {
      jest.spyOn(jwtService, 'verify').mockImplementation(() => {
        throw Object.assign(new Error('Token expired'), { name: 'TokenExpiredError' });
      });

      await expect(
        authService.refreshToken(refreshTokenDto),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for invalid JWT token', async () => {
      jest.spyOn(jwtService, 'verify').mockImplementation(() => {
        throw Object.assign(new Error('JsonWebTokenError'), { name: 'JsonWebTokenError' });
      });

      await expect(
        authService.refreshToken(refreshTokenDto),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
