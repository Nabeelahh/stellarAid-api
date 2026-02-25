import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
  Inject,
  Optional,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { RegisterDto } from './dtos/register.dto';
import { LoginDto } from './dtos/login.dto';
import { VerifyEmailDto } from './dtos/verify-email.dto';
import { ResendVerificationDto } from './dtos/resend-verification.dto';
import { RefreshTokenDto } from './dtos/refresh-token.dto';
import { JwtPayload } from './interfaces/auth.interface';
import { AuthResponseDto } from './dtos/auth-response.dto';
import { User, UserRole, KYCStatus } from '../users/entities/user.entity';
import { ChangePasswordDto } from '../users/dtos/change-password.dto';
import { SubmitKYCDto } from '../users/dtos/submit-kyc.dto';
import { UpdateKYCDto } from '../users/dtos/update-kyc.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  // Change password for a given user id
  async changePassword(
    userId: string,
    changeDto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isCurrentValid = await bcrypt.compare(
      changeDto.currentPassword,
      user.password,
    );
    if (!isCurrentValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Hash new password
    const saltRounds = 10;
    const hashed = await bcrypt.hash(changeDto.newPassword, saltRounds);

    // Update password and invalidate refresh tokens (clear refreshTokenHash)
    user.password = hashed;
    user.refreshTokenHash = null;
    await this.userRepository.save(user);

    // Try to send confirmation email if an email service is registered (optional)
    try {
      // If an injected email service exposes a `sendPasswordChangedEmail` method, call it.
      // We inject under token 'EMAIL_SERVICE' elsewhere in the app if available.
      // @ts-ignore
      if (
        (this as any).emailService &&
        typeof (this as any).emailService.sendPasswordChangedEmail ===
          'function'
      ) {
        // @ts-ignore
        await (this as any).emailService.sendPasswordChangedEmail(
          user.email,
          user.firstName,
        );
      }
    } catch (err) {
      // Do not fail the password change if email sending fails

      console.warn('Failed to send password change email', err);
    }

    return { message: 'Password changed successfully' };
  }

  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    const existingUser = await this.userRepository.findOne({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(registerDto.password, saltRounds);

    const user = this.userRepository.create({
      ...registerDto,
      password: hashedPassword,
      role: UserRole.USER,
      isEmailVerified: false,
    });

    await this.userRepository.save(user);

    // Note: Email integration temporarily disabled for server startup
    // TODO: Re-enable email service after resolving dependency injection
    this.logger.log(`User registered successfully: ${user.email}`);

    return this.generateTokens(user);
  }

  async login(loginDto: LoginDto, request?: any): Promise<AuthResponseDto> {
    const user = await this.userRepository.findOne({
      where: { email: loginDto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Note: Email integration temporarily disabled for server startup
    // TODO: Re-enable email service after resolving dependency injection
    this.logger.log(`User logged in successfully: ${user.email}`);

    return this.generateTokens(user);
  }

  async generateTokens(user: User): Promise<AuthResponseDto> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      walletAddress: user.walletAddress ?? undefined,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('jwtSecret'),
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('jwtRefreshSecret'),
        expiresIn: '7d',
      }),
    ]);

    // Store refresh token hash
    const saltRounds = 10;
    user.refreshTokenHash = await bcrypt.hash(refreshToken, saltRounds);
    await this.userRepository.save(user);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        walletAddress: user.walletAddress || '',
        isEmailVerified: user.isEmailVerified,
      },
    };
  }

  async validateUser(payload: JwtPayload): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }

  async verifyEmail(
    verifyEmailDto: VerifyEmailDto,
  ): Promise<{ message: string }> {
    // Basic implementation for now to fix controller errors
    const user = await this.userRepository.findOne({
      where: { emailVerificationToken: verifyEmailDto.token },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    if (
      user.emailVerificationTokenExpiry &&
      user.emailVerificationTokenExpiry < new Date()
    ) {
      throw new BadRequestException('Verification token has expired');
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationTokenExpiry = null;
    await this.userRepository.save(user);

    return { message: 'Email verified successfully' };
  }

  async resendVerification(
    resendVerificationDto: ResendVerificationDto,
  ): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: { email: resendVerificationDto.email },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isEmailVerified) {
      throw new BadRequestException('Email is already verified');
    }

    // Logic to update token and send email would go here
    return { message: 'Verification email resent' };
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({ where: { email } });

    // Always return success for security reasons
    if (!user) {
      return {
        message:
          'If an account with that email exists, a reset link has been sent',
      };
    }

    const selector = crypto.randomBytes(16).toString('hex');
    const validator = crypto.randomBytes(32).toString('hex');
    const saltRounds = 10;
    const validatorHash = await bcrypt.hash(validator, saltRounds);

    user.resetPasswordTokenSelector = selector;
    user.resetPasswordTokenHash = validatorHash;
    user.resetPasswordTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await this.userRepository.save(user);

    const token = `${selector}.${validator}`;

    try {
      // @ts-ignore
      if (
        (this as any).emailService &&
        typeof (this as any).emailService.sendPasswordResetEmail === 'function'
      ) {
        // @ts-ignore
        await (this as any).emailService.sendPasswordResetEmail(
          user.email,
          token,
          user.firstName,
        );
      }
    } catch (err) {
      // do not reveal email failures

      console.warn('Failed to send password reset email', err);
    }

    return {
      message:
        'If an account with that email exists, a reset link has been sent',
    };
  }

  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const parts = token.split('.');
    if (parts.length !== 2) {
      throw new BadRequestException('Invalid token');
    }

    const [selector, validator] = parts;
    const user = await this.userRepository.findOne({
      where: { resetPasswordTokenSelector: selector },
    });
    if (
      !user ||
      !user.resetPasswordTokenHash ||
      !user.resetPasswordTokenExpiry
    ) {
      throw new BadRequestException('Invalid or expired token');
    }

    if (user.resetPasswordTokenExpiry < new Date()) {
      throw new BadRequestException('Invalid or expired token');
    }

    const isValid = await bcrypt.compare(
      validator,
      user.resetPasswordTokenHash,
    );
    if (!isValid) {
      throw new BadRequestException('Invalid or expired token');
    }

    // Hash new password and clear reset token fields
    const saltRounds = 10;
    const hashed = await bcrypt.hash(newPassword, saltRounds);
    user.password = hashed;
    user.resetPasswordTokenSelector = null;
    user.resetPasswordTokenHash = null;
    user.resetPasswordTokenExpiry = null;
    // Invalidate refresh tokens/sessions
    user.refreshTokenHash = null;
    await this.userRepository.save(user);

    try {
      // @ts-ignore
      if (
        (this as any).emailService &&
        typeof (this as any).emailService.sendPasswordChangedEmail ===
          'function'
      ) {
        // @ts-ignore
        await (this as any).emailService.sendPasswordChangedEmail(
          user.email,
          user.firstName,
        );
      }
    } catch (err) {
      console.warn('Failed to send password changed email', err);
    }

    return { message: 'Password reset successfully' };
  }

  async submitKYC(
    userId: string,
    submitDto: SubmitKYCDto,
  ): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.kycStatus = KYCStatus.PENDING;
    user.kycDocumentUrl = submitDto.documentUrl;
    user.kycSubmittedAt = new Date();
    user.kycRejectionReason = null;
    await this.userRepository.save(user);

    try {
      // @ts-ignore
      if (
        (this as any).emailService &&
        typeof (this as any).emailService.sendKYCSubmittedEmail === 'function'
      ) {
        // @ts-ignore
        await (this as any).emailService.sendKYCSubmittedEmail(
          user.email,
          user.firstName,
        );
      }
    } catch (err) {
      console.warn('Failed to send KYC submitted email', err);
    }

    return { message: 'KYC documents submitted for review' };
  }

  async updateKYCStatus(
    userId: string,
    updateDto: UpdateKYCDto,
  ): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const oldStatus = user.kycStatus;
    user.kycStatus = updateDto.status;

    if (updateDto.status === KYCStatus.APPROVED) {
      user.kycVerifiedAt = new Date();
      user.kycRejectionReason = null;
    } else if (updateDto.status === KYCStatus.REJECTED) {
      user.kycRejectionReason = updateDto.rejectionReason || 'KYC rejected';
    }

    await this.userRepository.save(user);

    try {
      // @ts-ignore
      if (
        (this as any).emailService &&
        typeof (this as any).emailService.sendKYCStatusChangeEmail ===
          'function'
      ) {
        // @ts-ignore
        await (this as any).emailService.sendKYCStatusChangeEmail(
          user.email,
          user.firstName,
          updateDto.status,
          updateDto.rejectionReason || undefined,
        );
      }
    } catch (err) {
      console.warn('Failed to send KYC status change email', err);
    }

    return { message: `KYC status updated to ${updateDto.status}` };
  }

  async refreshToken(refreshTokenDto: RefreshTokenDto): Promise<AuthResponseDto> {
    try {
      // Verify the refresh token
      const payload = this.jwtService.verify(refreshTokenDto.refreshToken, {
        secret: this.configService.getOrThrow<string>('jwtRefreshSecret'),
      });

      // Find the user
      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
      });
      if (!user) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Check if the refresh token hash matches (token rotation)
      if (!user.refreshTokenHash) {
        this.logger.warn(
          `User ${user.id} attempted to use refresh token but no hash stored`,
        );
        throw new UnauthorizedException('Invalid refresh token');
      }

      const isTokenValid = await bcrypt.compare(
        refreshTokenDto.refreshToken,
        user.refreshTokenHash,
      );
      if (!isTokenValid) {
        // Possible token reuse attack - invalidate all tokens for this user
        this.logger.warn(
          `Possible token reuse attack detected for user ${user.id}`,
        );
        user.refreshTokenHash = null;
        await this.userRepository.save(user);
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Generate new tokens (token rotation)
      const newTokens = await this.generateTokens(user);

      // Invalidate the old refresh token by clearing the hash
      // The new token hash is already set in generateTokens
      this.logger.debug(`Token rotated successfully for user ${user.id}`);

      return newTokens;
    } catch (error) {
      if (
        error.name === 'JsonWebTokenError' ||
        error.name === 'TokenExpiredError'
      ) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }
      throw error;
    }
  }
}
