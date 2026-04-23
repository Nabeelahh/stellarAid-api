import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

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

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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
