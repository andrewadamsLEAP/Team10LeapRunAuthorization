import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { DATABASE_POOL } from './../src/database/database.module.js';

let capturedSignupValues: unknown[] | undefined;

const testDatabasePool = {
  query: async (sql: string, values?: unknown[]) => {
    if (sql.includes('SELECT 1')) return { rows: [] };
    if (sql.includes('INSERT INTO clients')) {
      capturedSignupValues = values;
      return {
        rows: [
          {
            client_id: 2,
            email: 'new-user@example.test',
            username: 'new-user',
            first_name: 'New',
            last_name: 'User',
          },
        ],
      };
    }
    return {
      rows: [
        {
          client_id: 1,
          username: 'test-user',
          email: 'test@example.test',
          password: process.env.TEST_PASSWORD_HASH,
        },
      ],
    };
  },
  end: async () => undefined,
};

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    capturedSignupValues = undefined;
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DATABASE_POOL)
      .useValue(testDatabasePool)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('creates a client with a bcrypt password hash and returns no password', async () => {
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        email: 'new-user@example.test',
        username: 'new-user',
        password: 'a-very-strong-test-password',
        first_name: 'New',
        last_name: 'User',
      })
      .expect(201)
      .expect({
        client_id: 2,
        email: 'new-user@example.test',
        username: 'new-user',
        first_name: 'New',
        last_name: 'User',
      });

    expect(capturedSignupValues?.[2]).toMatch(/^\$2[aby]\$12\$/);
    expect(capturedSignupValues?.[2]).not.toBe('a-very-strong-test-password');
  });

  it('refreshes tokens, rejects refresh replay, and revokes the session on logout', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'test-user', password: 'test-password' })
      .expect(201);
    const originalTokens = loginResponse.body as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      refresh_expires_in: number;
    };
    expect(originalTokens.expires_in).toBe(900);
    expect(originalTokens.refresh_expires_in).toBe(900);

    const duplicateLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'test-user', password: 'test-password' })
      .expect(409);
    expect(duplicateLogin.body.message).toContain('already logged in');
    expect(duplicateLogin.body).not.toHaveProperty('access_token');
    expect(duplicateLogin.body).not.toHaveProperty('refresh_token');

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${originalTokens.access_token}`)
      .expect(200)
      .expect({ userId: '1', username: 'test-user' });

    const refreshed = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refresh_token: originalTokens.refresh_token })
      .expect(201);
    const currentTokens = refreshed.body as {
      access_token: string;
      refresh_token: string;
    };
    expect(currentTokens.access_token).not.toBe(originalTokens.access_token);
    expect(currentTokens.refresh_token).not.toBe(originalTokens.refresh_token);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refresh_token: originalTokens.refresh_token })
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${currentTokens.access_token}`)
      .send({ refresh_token: currentTokens.refresh_token })
      .expect(201)
      .expect({ message: 'Successfully signed out.' });

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${currentTokens.access_token}`)
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refresh_token: currentTokens.refresh_token })
      .expect(401);

    const loginAfterLogout = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'test-user', password: 'test-password' })
      .expect(201);
    expect(loginAfterLogout.body.access_token).toBeTruthy();
    expect(loginAfterLogout.body.refresh_token).toBeTruthy();
  });

  afterEach(async () => {
    await app.close();
  });
});
