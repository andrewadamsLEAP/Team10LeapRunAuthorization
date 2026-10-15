import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

export type EmployeeRole = 'EMPLOYEE_ADMIN' | 'EMPLOYEE_REPORTER';

export const Roles = (...roles: EmployeeRole[]) => SetMetadata(ROLES_KEY, roles);
