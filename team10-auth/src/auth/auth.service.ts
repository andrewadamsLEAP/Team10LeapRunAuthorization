import {
  Injectable,
  Inject,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcrypt';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.module.js';

const ACCESS_TOKEN_LIFETIME_SECONDS = 60 * 60;

type ClientAccount = {
  client_id: string | number;
  username: string;
  email: string;
  password: string;
};

export type SignupInput = {
  email: string;
  username: string;
  password: string;
  firstName?: string;
  lastName?: string;
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

    const tokenId = randomUUID();
    const clientId = String(client.client_id);
    return {
      access_token: await this.jwtService.signAsync({
        sub: clientId,
        username: client.username,
        jti: tokenId,
      }),
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_LIFETIME_SECONDS,
    };
  }

  signOut(tokenId: string, tokenExpiresAt: number) {
    this.removeExpiredRevocations();
    this.revokedTokens.set(tokenId, tokenExpiresAt);
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

  private securelyMatches(candidate: string, expected: string) {
    const candidateBuffer = Buffer.from(candidate);
    const expectedBuffer = Buffer.from(expected);
    return (
      candidateBuffer.length === expectedBuffer.length &&
      timingSafeEqual(candidateBuffer, expectedBuffer)
    );
  }

  private removeExpiredRevocations() {
    const now = Math.floor(Date.now() / 1000);
    for (const [tokenId, expiresAt] of this.revokedTokens) {
      if (expiresAt <= now) this.revokedTokens.delete(tokenId);
    }
  }
}
