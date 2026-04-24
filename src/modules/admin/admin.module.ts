import { Module } from '@nestjs/common';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { PrismaModule } from '../../database/prisma.module';
import { EmailService } from '../users/email.service';

@Module({
  imports: [PrismaModule],
  controllers: [AdminUsersController],
  providers: [AdminUsersService, EmailService],
})
export class AdminModule {}
