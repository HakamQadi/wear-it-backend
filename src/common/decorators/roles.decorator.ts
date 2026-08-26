import { SetMetadata } from '@nestjs/common';
import { AccountRole } from '../types/jwt-payload';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: AccountRole[]) => SetMetadata(ROLES_KEY, roles);
