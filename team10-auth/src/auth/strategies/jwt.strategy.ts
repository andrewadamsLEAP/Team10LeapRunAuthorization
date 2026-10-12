import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from '../auth.service.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret || jwtSecret.length < 32) {
      throw new Error('Set JWT_SECRET to a random secret of at least 32 characters.');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: {
    sub: string;
    username: string;
    jti: string;
    exp: number;
    sid: string;
    token_use: string;
  }) {
    if (
      payload.token_use !== 'access' ||
      !payload.jti ||
      !payload.sid ||
      this.authService.isTokenRevoked(payload.jti) ||
      this.authService.isSessionRevoked(payload.sid)
    ) {
      throw new UnauthorizedException('This access token is no longer valid.');
    }
    return {
      userId: payload.sub,
      username: payload.username,
      tokenId: payload.jti,
      tokenExpiresAt: payload.exp,
      sessionId: payload.sid,
    };
  }
}
