import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

export type EmployeeRole = 'ADMIN' | 'REPORTER';

export const Roles = (...roles: EmployeeRole[]) => SetMetadata(ROLES_KEY, roles);
