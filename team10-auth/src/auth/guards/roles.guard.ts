import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EmployeeRole, ROLES_KEY } from '../decorators/roles.decorator.js';

type RoleAwareUser = {
  actorType?: string;
  role?: string;
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<EmployeeRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles?.length) return true;

    const request = context.switchToHttp().getRequest<{ user?: RoleAwareUser }>();
    const user = request.user;
    if (user?.actorType !== 'employee' || typeof user.role !== 'string') {
      throw new ForbiddenException('Employee role is required.');
    }

    const role = user.role.trim().toUpperCase();
    if (!requiredRoles.includes(role as EmployeeRole)) {
      throw new ForbiddenException('Insufficient employee role.');
    }
    return true;
  }
}
