import { IsEnum } from 'class-validator';
import { UserRole } from '../../auth/types/user-role.enum';

export class UpdateUserRoleDto {
  @IsEnum(UserRole)
  role!: UserRole;
}
