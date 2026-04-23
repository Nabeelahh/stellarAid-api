import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import * as bcrypt from 'bcryptjs';
import { EmailService } from './email.service';
import { UpdateUserDto } from './dto/update-user.dto';

export interface UserProfileResponse {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  country: string | null;
  bio: string | null;
  avatar: string | null;
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
      country,
      bio,
      avatar,
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
      country,
      bio,
      avatar,
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
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password,
    );
    if (!isCurrentPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { password: hashedNewPassword },
      }),
      this.prisma.refreshToken.deleteMany({
        where: { userId },
      }),
    ]);

    try {
      await this.emailService.sendPasswordChangeConfirmation(
        user.email,
        userId,
      );
    } catch (error) {
      console.error(
        'Failed to send password change confirmation email:',
        error,
      );
    }

    return { message: 'Password changed successfully' };
  }

  async updateProfile(
    userId: string,
    updateData: UpdateUserDto,
  ): Promise<UserProfileResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (
      updateData.walletAddress &&
      updateData.walletAddress !== user.walletAddress
    ) {
      const existingWallet = await this.prisma.user.findUnique({
        where: { walletAddress: updateData.walletAddress },
      });
      if (existingWallet) {
        throw new BadRequestException('Wallet address is already in use');
      }
    }

    const allowedFields = [
      'firstName',
      'lastName',
      'country',
      'bio',
      'avatar',
      'walletAddress',
    ];
    const updatePayload: any = {};

    for (const field of allowedFields) {
      if (updateData[field as keyof UpdateUserDto] !== undefined) {
        updatePayload[field] = updateData[field as keyof UpdateUserDto];
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: updatePayload,
    });

    const profileCompletion = this.calculateProfileCompletion(updatedUser);

    const {
      id,
      email,
      firstName,
      lastName,
      country,
      bio,
      avatar,
      role,
      status,
      isEmailVerified,
      walletAddress,
      kycStatus,
      createdAt,
      updatedAt,
    } = updatedUser;

    return {
      id,
      email,
      firstName,
      lastName,
      country,
      bio,
      avatar,
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

  private calculateProfileCompletion(user: any): number {
    const fields = [
      { name: 'firstName', weight: 0.15 },
      { name: 'lastName', weight: 0.15 },
      { name: 'country', weight: 0.1 },
      { name: 'bio', weight: 0.1 },
      { name: 'avatar', weight: 0.1 },
      { name: 'isEmailVerified', weight: 0.1 },
      { name: 'walletAddress', weight: 0.15 },
      {
        name: 'kycStatus',
        weight: 0.15,
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
