import {
  Injectable,
  Inject,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import bcrypt from 'bcrypt';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.module.js';

const ACCESS_TOKEN_LIFETIME_SECONDS = 30 * 60;
const REFRESH_TOKEN_LIFETIME_SECONDS = 30 * 60;
const TOKEN_LIFETIME = '30m';

type RefreshTokenPayload = {
  sub: string;
  username: string;
  jti: string;
  exp: number;
  sid: string;
  token_use: 'refresh';
};

type ClientAccount = {
  client_id: string | number;
  username: string;
  email: string;
  password: string;
};

type EmployeeAccount = {
  employee_id: string | number;
  username: string;
  email: string;
  password: string;
  role: string;
};

type SessionState = {
  sessionId: string;
  expiresAt: number;
  actorType: 'client' | 'employee';
  role?: string;
};

export type SignupInput = {
  email: string;
  username: string;
  password: string;
  firstName?: string;
  lastName?: string;
};

export type CreateReporterInput = {
  email: string;
  username: string;
  password: string;
  firstName: string;
  lastName: string;
};

export type PublicClientAccount = {
  client_id: string | number;
  email: string;
  username: string;
  first_name: string | null;
  last_name: string | null;
};

@Injectable()
export class AuthService {
  private readonly revokedTokens = new Map<string, number>();
  private readonly revokedSessions = new Map<string, number>();
  private readonly activeSessions = new Map<
    string,
    SessionState
  >();

  constructor(
    private readonly jwtService: JwtService,
    @Inject(DATABASE_POOL) private readonly database: Pool,
  ) {}

  async signUp(input: SignupInput): Promise<PublicClientAccount> {
    const passwordHash = await bcrypt.hash(input.password, 12);
    try {
      const result = await this.database.query<PublicClientAccount>(
        `INSERT INTO clients
           (email, username, password, first_name, last_name, cash_amount)
         VALUES ($1, $2, $3, $4, $5, 0)
         RETURNING client_id, email, username, first_name, last_name`,
        [
          input.email,
          input.username,
          passwordHash,
          input.firstName ?? null,
          input.lastName ?? null,
        ],
      );
      return result.rows[0];
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
      ) {
        throw new ConflictException('That email or username is already registered.');
      }
      throw error;
    }
  }

  async createReporter(input: CreateReporterInput) {
    const passwordHash = await bcrypt.hash(input.password, 12);
    try {
      const result = await this.database.query(
        `INSERT INTO employees
           (email, username, password, first_name, last_name, role)
         VALUES ($1, $2, $3, $4, $5, 'REPORTER')
         RETURNING employee_id, email, username, first_name, last_name, role`,
        [
          input.email,
          input.username,
          passwordHash,
          input.firstName,
          input.lastName,
        ],
      );
      return result.rows[0];
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
      ) {
        throw new ConflictException('That employee email or username already exists.');
      }
      throw error;
    }
  }

  async signIn(identifier: string, password: string) {
    const result = await this.database.query<ClientAccount>(
      `SELECT client_id, username, email, password
       FROM clients
       WHERE username = $1 OR email = $1
       LIMIT 1`,
      [identifier],
    );
    const client = result.rows[0];

    // Only bcrypt password hashes are accepted; plaintext passwords must be migrated first.
    if (
      !client ||
      typeof client.password !== 'string' ||
      !/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(client.password)
    ) {
      throw new UnauthorizedException('Invalid username or password.');
    }
    const passwordMatches = await bcrypt.compare(password, client.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid username or password.');
    }

    const userId = String(client.client_id);
    const now = Math.floor(Date.now() / 1000);
    const activeSession = this.activeSessions.get(userId);
    if (activeSession && activeSession.expiresAt > now) {
      throw new ConflictException(
        'This account is already logged in. Log out or wait for the session to expire before signing in again.',
      );
    }
    if (activeSession) this.activeSessions.delete(userId);

    const sessionId = randomUUID();
    // Reserve the account before awaiting token signing to prevent concurrent duplicate logins.
    this.activeSessions.set(userId, {
      sessionId,
      expiresAt: now + REFRESH_TOKEN_LIFETIME_SECONDS,
      actorType: 'client',
      role: 'CLIENT',
    });
    try {
      return await this.createTokenPair(userId, client.username, sessionId, {
        actorType: 'client',
        role: 'CLIENT',
      });
    } catch (error) {
      if (this.activeSessions.get(userId)?.sessionId === sessionId) {
        this.activeSessions.delete(userId);
      }
      throw error;
    }
  }

  async refreshSession(refreshToken: string) {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(refreshToken);
    } catch {
      throw new UnauthorizedException('Refresh token is invalid or expired. Please sign in again.');
    }

    if (
      payload.token_use !== 'refresh' ||
      !payload.sub ||
      !payload.username ||
      !payload.jti ||
      !payload.exp ||
      !payload.sid ||
      this.isTokenRevoked(payload.jti) ||
      this.isSessionRevoked(payload.sid) ||
      this.activeSessions.get(payload.sub)?.sessionId !== payload.sid
    ) {
      throw new UnauthorizedException('Refresh token is invalid or expired. Please sign in again.');
    }

    this.revokeToken(payload.jti, payload.exp);
    const session = this.activeSessions.get(payload.sub);
    if (!session) {
      throw new UnauthorizedException('Refresh token session is no longer active.');
    }
    return this.createTokenPair(payload.sub, payload.username, payload.sid, {
      actorType: session.actorType,
      role: session.role,
    });
  }

  async signOut(
    accessTokenId: string,
    accessTokenExpiresAt: number,
    refreshToken: string,
    expectedUserId: string,
    expectedSessionId: string,
  ) {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(refreshToken);
    } catch {
      throw new UnauthorizedException('A valid refresh token is required to sign out.');
    }

    if (
      payload.token_use !== 'refresh' ||
      payload.sub !== expectedUserId ||
      payload.sid !== expectedSessionId ||
      !payload.jti ||
      !payload.exp ||
      !payload.sid ||
      this.isSessionRevoked(payload.sid) ||
      this.isTokenRevoked(payload.jti)
    ) {
      throw new UnauthorizedException('A valid refresh token for this session is required.');
    }

    this.revokeToken(accessTokenId, accessTokenExpiresAt);
    this.revokeToken(payload.jti, payload.exp);
    this.revokeSession(
      expectedSessionId,
      Math.max(accessTokenExpiresAt, payload.exp),
    );
    this.activeSessions.delete(expectedUserId);
  }

  private async createTokenPair(
    userId: string,
    username: string,
    sessionId: string,
    claims: { actorType: 'client' | 'employee'; role?: string },
  ) {
    const accessToken = await this.jwtService.signAsync(
      {
        sub: userId,
        username,
        jti: randomUUID(),
        sid: sessionId,
        token_use: 'access',
        ...claims,
      },
      { expiresIn: TOKEN_LIFETIME },
    );
    const refreshToken = await this.jwtService.signAsync(
      {
        sub: userId,
        username,
        jti: randomUUID(),
        sid: sessionId,
        token_use: 'refresh',
        ...claims,
      },
      { expiresIn: TOKEN_LIFETIME },
    );

    const refreshPayload = this.jwtService.decode(refreshToken) as {
      exp: number;
    };
    const activeSession = this.activeSessions.get(userId);
    if (activeSession?.sessionId === sessionId) {
      activeSession.expiresAt = refreshPayload.exp;
    }

    return {
     access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_LIFETIME_SECONDS,
      refresh_expires_in: REFRESH_TOKEN_LIFETIME_SECONDS,
    };
  }

  async signInEmployee(identifier: string, password: string) {
    const result = await this.database.query<EmployeeAccount>(
      `SELECT employee_id, username, email, password, role
       FROM employees
       WHERE username = $1 OR email = $1
       LIMIT 1`,
      [identifier],
    );
    const employee = result.rows[0];

    if (
      !employee ||
      typeof employee.password !== 'string' ||
      !/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(employee.password)
    ) {
      throw new UnauthorizedException('Invalid username or password.');
    }
    const passwordMatches = await bcrypt.compare(password, employee.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid username or password.');
    }

    const employeeId = String(employee.employee_id);
    const databaseRole = employee.role.trim().toUpperCase();
    if (databaseRole !== 'ADMIN' && databaseRole !== 'REPORTER') {
      throw new UnauthorizedException('Invalid employee role.');
    }
    const role = databaseRole === 'ADMIN' ? 'EMPLOYEE_ADMIN' : 'EMPLOYEE_REPORTER';

    const now = Math.floor(Date.now() / 1000);
    const activeSession = this.activeSessions.get(employeeId);
    if (activeSession && activeSession.expiresAt > now) {
      throw new ConflictException(
        'This account is already logged in. Log out or wait for the session to expire before signing in again.',
      );
    }
    if (activeSession) this.activeSessions.delete(employeeId);

    const sessionId = randomUUID();
    this.activeSessions.set(employeeId, {
      sessionId,
      expiresAt: now + REFRESH_TOKEN_LIFETIME_SECONDS,
      actorType: 'employee',
      role,
    });
    try {
      return await this.createTokenPair(employeeId, employee.username, sessionId, {
        actorType: 'employee',
        role,
      });
    } catch (error) {
      if (this.activeSessions.get(employeeId)?.sessionId === sessionId) {
        this.activeSessions.delete(employeeId);
      }
      throw error;
    }
  }

  private revokeToken(tokenId: string, tokenExpiresAt: number) {
    this.removeExpiredRevocations();
    this.revokedTokens.set(tokenId, tokenExpiresAt);
  }

  private revokeSession(sessionId: string, sessionExpiresAt: number) {
    this.removeExpiredRevocations();
    this.revokedSessions.set(sessionId, sessionExpiresAt);
  }

  isSessionRevoked(sessionId: string) {
    const expiresAt = this.revokedSessions.get(sessionId);
    if (expiresAt === undefined) return false;
    if (expiresAt <= Math.floor(Date.now() / 1000)) {
      this.revokedSessions.delete(sessionId);
      return false;
    }
    return true;
  }

  isTokenRevoked(tokenId: string) {
    const expiresAt = this.revokedTokens.get(tokenId);
    if (expiresAt === undefined) return false;
    if (expiresAt <= Math.floor(Date.now() / 1000)) {
      this.revokedTokens.delete(tokenId);
      return false;
    }
    return true;
  }

  private removeExpiredRevocations() {
    const now = Math.floor(Date.now() / 1000);
    for (const [tokenId, expiresAt] of this.revokedTokens) {
      if (expiresAt <= now) this.revokedTokens.delete(tokenId);
    }
    for (const [sessionId, expiresAt] of this.revokedSessions) {
      if (expiresAt <= now) this.revokedSessions.delete(sessionId);
    }
  }
}
