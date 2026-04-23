import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public, CurrentUser, Roles } from './modules/auth';
import { UserRole } from './modules/auth/types/user-role.enum';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('protected')
  getProtected(@CurrentUser() user: any): any {
    return {
      message: 'This is a protected route',
      user: user,
    };
  }

  @Roles(UserRole.ADMIN)
  @Get('admin-only')
  getAdminOnly(@CurrentUser() user: any): any {
    return {
      message: 'This route is only accessible by admins',
      user: user,
    };
  }

  @Roles(UserRole.CREATOR, UserRole.ADMIN)
  @Get('creator-admin')
  getCreatorAdmin(@CurrentUser() user: any): any {
    return {
      message: 'This route is accessible by creators and admins',
      user: user,
    };
  }

  @Roles(UserRole.DONOR, UserRole.ADMIN)
  @Get('donor-admin')
  getDonorAdmin(@CurrentUser() user: any): any {
    return {
      message: 'This route is accessible by donors and admins',
      user: user,
    };
  }
}
