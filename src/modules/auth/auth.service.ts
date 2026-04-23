import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { RegisterDto, LoginDto, JwtPayload, JwtTokens } from './index';
import { UserRole } from '../../../generated/prisma';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: AppConfigService,
  ) {}

  async register(registerDto: RegisterDto) {
    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email: registerDto.email,
        password: hashedPassword,
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
        role: registerDto.role as UserRole,
        status: 'PENDING',
      },
    });

    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    const expirationHours = parseInt(
      this.configService.emailVerificationTokenExpiration,
    );
    expiresAt.setHours(expiresAt.getHours() + expirationHours);

    await this.prisma.emailToken.create({
      data: {
        token: verificationToken,
        userId: user.id,
        type: 'VERIFICATION',
        expiresAt,
      },
    });

    // TODO: Send verification email

    return {
      message:
        'Registration successful. Please check your email to verify your account.',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
      },
    };
  }

  async login(loginDto: LoginDto) {
    // Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if user is active
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active');
    }

    // Generate tokens
    const tokens = await this.generateTokens(user);

    // Store refresh token
    await this.storeRefreshToken(user.id, tokens.refreshToken);

    return {
      message: 'Login successful',
      tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
      },
    };
  }

  async verifyEmail(token: string) {
    // Find verification token
    const emailToken = await this.prisma.emailToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!emailToken) {
      throw new BadRequestException('Invalid verification token');
    }

    // Check if token is expired
    if (emailToken.expiresAt < new Date()) {
      throw new BadRequestException('Verification token has expired');
    }

    // Check if token is for verification
    if (emailToken.type !== 'VERIFICATION') {
      throw new BadRequestException('Invalid token type');
    }

    // Update user as verified
    await this.prisma.user.update({
      where: { id: emailToken.userId },
      data: {
        isEmailVerified: true,
        emailVerifiedAt: new Date(),
        status: 'ACTIVE',
      },
    });

    // Delete used token
    await this.prisma.emailToken.delete({
      where: { id: emailToken.id },
    });

    return { message: 'Email verified successfully' };
  }

  async refreshToken(refreshToken: string) {
    // Find refresh token in database
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Check if token has already been used (security breach detection)
    if (storedToken.isUsed) {
      // Security breach: token reuse detected
      // Invalidate all refresh tokens for this user
      await this.prisma.refreshToken.deleteMany({
        where: { userId: storedToken.userId },
      });
      throw new UnauthorizedException('Security breach detected: token reuse');
    }

    // Check if token is expired
    if (storedToken.expiresAt < new Date()) {
      // Mark token as used to prevent reuse
      await this.prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { isUsed: true },
      });
      throw new UnauthorizedException('Refresh token has expired');
    }

    // Check if user is still active
    if (storedToken.user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account is not active');
    }

    // Mark the old token as used (rotation)
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { isUsed: true },
    });

    // Generate new tokens
    const tokens = await this.generateTokens(storedToken.user);

    // Store new refresh token
    await this.storeRefreshToken(storedToken.user.id, tokens.refreshToken);

    return {
      message: 'Token refreshed successfully',
      tokens,
    };
  }

  async logout(userId: string, refreshToken: string) {
    // Delete specific refresh token from database
    const deletedCount = await this.prisma.refreshToken.deleteMany({
      where: {
        userId,
        token: refreshToken,
        isUsed: false, // Only delete unused tokens
      },
    });

    if (deletedCount.count === 0) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return { message: 'Logout successful' };
  }

  private async generateTokens(user: any): Promise<JwtTokens> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.jwtSecret,
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.jwtSecret,
        expiresIn: '7d',
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async storeRefreshToken(userId: string, token: string) {
    const expiresAt = new Date();
    const expirationTime = this.configService.jwtRefreshTokenExpiration;

    // Parse expiration time (e.g., "7d" -> 7 days)
    const match = expirationTime.match(/(\d+)([hd])/);
    if (match) {
      const value = parseInt(match[1]);
      const unit = match[2];
      if (unit === 'h') {
        expiresAt.setHours(expiresAt.getHours() + value);
      } else if (unit === 'd') {
        expiresAt.setDate(expiresAt.getDate() + value);
      }
    }

    // Store token as plain text (it's a cryptographically secure random string)
    await this.prisma.refreshToken.create({
      data: {
        token,
        userId,
        expiresAt,
        isUsed: false,
      },
    });
  }
}
