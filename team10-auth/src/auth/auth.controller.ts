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

type AuthenticatedUser = {
  userId: string;
  username: string;
  tokenId: string;
  tokenExpiresAt: number;
  sessionId: string;
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

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      throw new BadRequestException('Invalid email. Provide a valid email address.');
    }
    if (
      username.length < 3 ||
      username.length > 50 ||
      !/^[a-zA-Z0-9_.-]+$/.test(username)
    ) {
      throw new BadRequestException(
        'Invalid username. Use 3–50 characters: letters, numbers, underscores, periods, or hyphens.',
      );
    }
    if (
      typeof password !== 'string' ||
      password.length < 12 ||
      Buffer.byteLength(password, 'utf8') > 72
    ) {
      throw new BadRequestException(
        'Invalid password. It must be at least 12 characters and no more than 72 UTF-8 bytes.',
      );
    }
    if (
      (firstName !== undefined && typeof firstName !== 'string') ||
      (lastName !== undefined && typeof lastName !== 'string') ||
      (typeof firstName === 'string' && firstName.length > 100) ||
      (typeof lastName === 'string' && lastName.length > 100)
    ) {
      throw new BadRequestException('first_name and last_name must be strings of at most 100 characters.');
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
    return this.authService.signIn(identifier, loginDto.password);
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
    return { userId: user.userId, username: user.username };
  }
}
