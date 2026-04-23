import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import * as bcrypt from 'bcryptjs';
import { EmailService } from './email.service';

export interface UserProfileResponse {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  status: string;
  isEmailVerified: boolean;
  walletAddress: string | null;
  kycStatus: string | null;
  createdAt: Date;
  updatedAt: Date;
  profileCompletion: number;
}

export interface ChangePasswordResponse {
  message: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async getUserProfile(userId: string): Promise<UserProfileResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const profileCompletion = this.calculateProfileCompletion(user);

    const {
      id,
      email,
      firstName,
      lastName,
      role,
      status,
      isEmailVerified,
      walletAddress,
      kycStatus,
      createdAt,
      updatedAt,
    } = user;

    return {
      id,
      email,
      firstName,
      lastName,
      role,
      status,
      isEmailVerified,
      walletAddress,
      kycStatus,
      createdAt,
      updatedAt,
      profileCompletion,
    };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<ChangePasswordResponse> {
    // Get user with password
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password,
    );
    if (!isCurrentPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Begin transaction: update password and invalidate all refresh tokens
    await this.prisma.$transaction([
      // Update password
      this.prisma.user.update({
        where: { id: userId },
        data: { password: hashedNewPassword },
      }),
      // Delete all refresh tokens (invalidate all sessions)
      this.prisma.refreshToken.deleteMany({
        where: { userId },
      }),
    ]);

    // Send confirmation email (fire and forget, don't block response)
    try {
      await this.emailService.sendPasswordChangeConfirmation(
        user.email,
        userId,
      );
    } catch (error) {
      // Log error but don't fail the request
      console.error(
        'Failed to send password change confirmation email:',
        error,
      );
    }

    return { message: 'Password changed successfully' };
  }

  private calculateProfileCompletion(user: any): number {
    const fields = [
      { name: 'firstName', weight: 0.15 },
      { name: 'lastName', weight: 0.15 },
      { name: 'isEmailVerified', weight: 0.2 },
      { name: 'walletAddress', weight: 0.3 },
      {
        name: 'kycStatus',
        weight: 0.2,
        completedWhen: (val: any) => val === 'VERIFIED' || val === 'PENDING',
      },
    ];

    let completion = 0;

    for (const field of fields) {
      const value = user[field.name];
      if (field.completedWhen) {
        if (field.completedWhen(value)) {
          completion += field.weight;
        }
      } else if (value) {
        completion += field.weight;
      }
    }

    return Math.round(completion * 100);
  }
}
