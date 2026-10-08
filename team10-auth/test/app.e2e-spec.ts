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

  it('signs in, protects account access, and revokes the token on logout', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'test-user', password: 'test-password' })
      .expect(201);
    const accessToken = loginResponse.body.access_token as string;

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect({ userId: '1', username: 'test-user' });

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201)
      .expect({ message: 'Successfully signed out.' });

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);
  });

  afterEach(async () => {
    await app.close();
  });
});
