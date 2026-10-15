import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthService, SignupInput } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Roles } from './decorators/roles.decorator.js';
import { RolesGuard } from './guards/roles.guard.js';

type AuthenticatedUser = {
  userId: string;
  username: string;
  tokenId: string;
  tokenExpiresAt: number;
  sessionId: string;
  actorType?: string;
  role?: string;
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  async signup(
    @Body()
    signupDto: {
      email?: unknown;
      username?: unknown;
      password?: unknown;
      first_name?: unknown;
      last_name?: unknown;
    },
  ) {
    const email = typeof signupDto?.email === 'string' ? signupDto.email.trim().toLowerCase() : '';
    const username = typeof signupDto?.username === 'string' ? signupDto.username.trim() : '';
    const password = signupDto?.password;
    const firstName = signupDto?.first_name;
    const lastName = signupDto?.last_name;

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254 ||
      username.length < 3 ||
      username.length > 50 ||
      !/^[a-zA-Z0-9_.-]+$/.test(username) ||
      typeof password !== 'string' ||
      password.length < 12 ||
      Buffer.byteLength(password, 'utf8') > 72 ||
      (firstName !== undefined && typeof firstName !== 'string') ||
      (lastName !== undefined && typeof lastName !== 'string') ||
      (typeof firstName === 'string' && firstName.length > 100) ||
      (typeof lastName === 'string' && lastName.length > 100)
    ) {
      throw new BadRequestException(
        'Provide a valid email, a 3–50 character username, and a password of 12–72 characters.',
      );
    }

    const input: SignupInput = {
      email,
      username,
      password,
      firstName: typeof firstName === 'string' ? firstName.trim() || undefined : undefined,
      lastName: typeof lastName === 'string' ? lastName.trim() || undefined : undefined,
    };
    return this.authService.signUp(input);
  }

  @Post('login')
  async login(
    @Body()
    loginDto: {
      username?: unknown;
      email?: unknown;
      password?: unknown;
    },
  ) {
    const identifier = loginDto?.username ?? loginDto?.email;
    if (
      typeof identifier !== 'string' ||
      typeof loginDto.password !== 'string' ||
      !identifier ||
      !loginDto.password
    ) {
      throw new BadRequestException('username (or email) and password are required.');
    }
    return this.authService.signInUnified(identifier, loginDto.password);
  }


  @Post('refresh')
  async refresh(@Body() refreshDto: { refresh_token?: unknown }) {
    if (typeof refreshDto?.refresh_token !== 'string' || !refreshDto.refresh_token) {
      throw new BadRequestException('refresh_token is required.');
    }
    return this.authService.refreshSession(refreshDto.refresh_token);
  }
  @Post('employee/login')
  async employeeLogin(
    @Body() loginDto: { username?: unknown; email?: unknown; password?: unknown },
  ) {
    const identifier = loginDto?.username ?? loginDto?.email;
    if (
      typeof identifier !== 'string' ||
      typeof loginDto.password !== 'string' ||
      !identifier ||
      !loginDto.password
    ) {
      throw new BadRequestException('username (or email) and password are required.');
    }
    return this.authService.signInEmployee(identifier, loginDto.password);

  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() logoutDto: { refresh_token?: unknown },
  ) {
    if (typeof logoutDto?.refresh_token !== 'string' || !logoutDto.refresh_token) {
      throw new BadRequestException('refresh_token is required to sign out.');
    }
    await this.authService.signOut(
      user.tokenId,
      user.tokenExpiresAt,
      logoutDto.refresh_token,
      user.userId,
      user.sessionId,
    );
    return { message: 'Successfully signed out.' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getCurrentUser(@CurrentUser() user: AuthenticatedUser) {
    return {
      userId: user.userId,
      username: user.username,
      actorType: user.actorType,
      role: user.role,
    };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('employee/admin/check')
  adminCheck(@CurrentUser() user: AuthenticatedUser) {
    return { authorized: true, role: user.role, username: user.username };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('REPORTER')
  @Get('employee/reporter/check')
  reporterCheck(@CurrentUser() user: AuthenticatedUser) {
    return { authorized: true, role: user.role, username: user.username };
  }
}
