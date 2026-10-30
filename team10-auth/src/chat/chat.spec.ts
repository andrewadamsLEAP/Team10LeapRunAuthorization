import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { vi } from 'vitest';
import { ChatModule } from './chat.module.js';
import { ChatService } from './chat.service.js';
import { ChatProvider, GeminiChatProvider } from './chat.provider.js';
import { SITE_HELP } from './site-help.js';

describe('POST /chat/message (isolated HTTP integration)', () => {
  let app: INestApplication;
  const rewrite = vi.fn<ChatProvider['rewrite']>();

  beforeEach(async () => {
    rewrite.mockReset().mockResolvedValue(null);
    const module = await Test.createTestingModule({ imports: [ChatModule] })
      .overrideProvider(ChatProvider).useValue({ rewrite }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => { await app.close(); vi.restoreAllMocks(); });

  it('works with no AI provider and returns the same response contract', async () => {
    const response = await request(app.getHttpServer()).post('/chat/message')
      .send({ message: 'How do I create an account?' }).expect(200);
    expect(response.body).toEqual({ reply: SITE_HELP[1]!.answer, sources: ['account-setup'], fallback: true, mode: 'faq' });
  });

  it('returns conversational provider output grounded in a public source', async () => {
    rewrite.mockResolvedValue('To register, enter an email, username, and password in the registration form.');
    const response = await request(app.getHttpServer()).post('/chat/message')
      .send({ message: 'How do I register?' }).expect(200);
    expect(response.body.mode).toBe('gemini');
    expect(response.body.fallback).toBe(false);
    expect(response.body.sources).toEqual(['account-setup']);
    expect(rewrite).toHaveBeenCalledWith(SITE_HELP[1]);
  });

  it.each([
    ['Hi Chatbert!', 'help-scope'],
    ['Hey there!', 'help-scope'],
    ['Hello, how are you?', 'help-scope'],
    ['What can you help me with?', 'help-scope'],
    ['How do I use this website?', 'help-scope'],
    ['Can you help me?', 'help-scope'],
    ['I need help signing up', 'account-setup'],
    ['How do I open an account?', 'account-setup'],
    ['What are the password requirements?', 'account-setup'],
    ['I’m having trouble logging in', 'account-login'],
    ['How does signing in work?', 'account-login'],
    ['What is an instrument?', 'instrument-help'],
    ['What is a balance?', 'balance-help'],
    ['My balance is 500', 'balance-help'],
    ['Sign in with me@example.test', 'account-login'],
    ['What should I do if login fails?', 'account-login'],
    ['Where do I view holdings?', 'holdings-navigation'],
    ['Where are my orders?', 'orders-navigation'],
    ['How do I see transactions?', 'transactions-navigation'],
    ['How do I reset my password?', 'password-help'],
    ['This page is not loading', 'browser-help'],
    ['Can I talk to support?', 'support-help'],
  ])('recognizes ordinary phrasing: %s', async (message, source) => {
    rewrite.mockResolvedValue('Approved conversational help.');
    const response = await request(app.getHttpServer()).post('/chat/message')
      .send({ message }).expect(200);
    expect(response.body.sources).toEqual([source]);
    expect(response.body.mode).toBe('gemini');
    expect(rewrite).toHaveBeenCalledTimes(1);
  });

  it.each([
    {}, { message: '' }, { message: '   ' }, { message: 42 },
    { message: 'x'.repeat(1001) }, { message: 'hi', token: 'not-accepted' },
    { message: '\u0000hello' }, ['hello'],
  ])('rejects invalid input without invoking a provider: %j', async body => {
    await request(app.getHttpServer()).post('/chat/message').send(body).expect(400);
    expect(rewrite).not.toHaveBeenCalled();
  });

  it.each([
    'What is the weather?', 'Hello, tell me about taxes', 'Help me with the weather',
    'Which stock should I buy?', 'Cancel my order for me',
    'Please register me, my password is secret', 'login with Bearer private-token',
  ])('does not call AI for unsupported or sensitive input', async message => {
    const response = await request(app.getHttpServer()).post('/chat/message').send({ message }).expect(200);
    expect(response.body.fallback).toBe(true);
    expect(response.body.sources).toEqual([]);
    expect(rewrite).not.toHaveBeenCalled();
  });

  it('rate limits by socket IP even if forwarded headers change', async () => {
    for (let index = 0; index < 10; index++) {
      await request(app.getHttpServer()).post('/chat/message')
        .set('X-Forwarded-For', `192.0.2.${index}`).send({ message: 'hello' }).expect(200);
    }
    const response = await request(app.getHttpServer()).post('/chat/message')
      .set('X-Forwarded-For', '192.0.2.200').send({ message: 'hello' }).expect(429);
    expect(response.headers['retry-after']).toBeDefined();
  });

  it('combines relevant public help for multi-topic questions', async () => {
    const response = await request(app.getHttpServer()).post('/chat/message')
      .send({ message: 'What is the difference between orders and transactions?' }).expect(200);
    expect(response.body.sources).toEqual(['orders-navigation', 'transactions-navigation']);
    expect(rewrite).toHaveBeenCalledTimes(1);
    expect(rewrite.mock.calls[0]![0].answer).not.toContain('DRAFT');
  });
});

describe('Gemini provider privacy and failure handling', () => {
  const entry = SITE_HELP[1]!;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv('CHAT_PROVIDER', 'gemini');
    vi.stubEnv('GEMINI_API', 'test-only-placeholder');
    vi.stubEnv('GEMINI_MODEL', 'gemini-2.5-flash-lite');
    fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Use the registration form to set up your account.' }] } }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('sends only public FAQ data, never raw messages, headers, or history', async () => {
    const service = new ChatService(new GeminiChatProvider());
    // Deliberately unrecognised private text is still not forwarded.
    const rawMessage = 'How do I register? private-marker-never-forward';
    expect((await service.message(rawMessage)).mode).toBe('gemini');
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).not.toContain('test-only-placeholder');
    expect(options.headers['x-goog-api-key']).toBe('test-only-placeholder');
    expect(options.body).not.toContain(rawMessage);
    expect(options.body).not.toContain('private-marker-never-forward');
    const body = JSON.parse(options.body);
    expect(JSON.parse(body.contents[0].parts[0].text)).toEqual({ question: entry.question, answer: entry.answer });
    expect(body).not.toHaveProperty('tools');
  });

  it('makes no external requests in FAQ mode', async () => {
    vi.stubEnv('CHAT_PROVIDER', 'faq');
    expect(await new GeminiChatProvider().rewrite(entry)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('makes no requests without a key or for unapproved knowledge', async () => {
    expect(await new GeminiChatProvider().rewrite({ ...SITE_HELP[3]!, approved: false })).toBeNull();
    vi.stubEnv('GEMINI_API_KEY', '');
    expect(await new GeminiChatProvider().rewrite(entry)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([401, 429, 500])('falls back safely on provider HTTP %i', async status => {
    fetchMock.mockResolvedValue(new Response('private upstream error', { status }));
    const reply = await new ChatService(new GeminiChatProvider()).message('How do I register?');
    expect(reply.reply).toBe(entry.answer);
    expect(reply.mode).toBe('faq');
    expect(reply.fallback).toBe(true);
  });

  it('falls back safely on timeouts, invalid JSON and blocked/truncated output', async () => {
    const provider = new GeminiChatProvider();
    fetchMock.mockRejectedValueOnce(new Error('timeout'));
    expect(await provider.rewrite(entry)).toBeNull();
    fetchMock.mockResolvedValueOnce(new Response('not json'));
    expect(await provider.rewrite(entry)).toBeNull();
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ finishReason: 'MAX_TOKENS' }] })));
    expect(await provider.rewrite(entry)).toBeNull();
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '<script>bad</script>' }] } }] })));
    expect(await provider.rewrite(entry)).toBeNull();
  });

  it('caps global provider spending by limiting calls per minute', async () => {
    const provider = new GeminiChatProvider();
    for (let index = 0; index < 35; index++) await provider.rewrite(entry);
    expect(fetchMock).toHaveBeenCalledTimes(30);
  });
});
