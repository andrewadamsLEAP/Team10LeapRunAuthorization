import bcrypt from 'bcrypt';

process.env.JWT_SECRET ??= 'test-only-jwt-secret-with-at-least-32-characters';
process.env.TEST_PASSWORD_HASH ??= await bcrypt.hash('test-password', 4);