import { Injectable } from '@nestjs/common';
import type { HelpEntry } from './site-help.js';

/** The adapter receives public, approved help ONLY; never a request or user text. */
export abstract class ChatProvider {
  abstract rewrite(entry: HelpEntry): Promise<string | null>;
}

@Injectable()
export class GeminiChatProvider extends ChatProvider {
  private windowStart = 0;
  private requests = 0;
  private inFlight = 0;

  async rewrite(entry: HelpEntry): Promise<string | null> {
    const key = process.env.GEMINI_API_KEY;
    const mode = process.env.CHAT_PROVIDER ?? (key ? 'gemini' : 'faq');
    if (mode !== 'gemini' || !key || !entry.approved) return null;
    // Process-wide provider budget: no retries, at most 30 calls/minute, 4 concurrent.
    const now = Date.now();
    if (now - this.windowStart >= 60_000) {
      this.windowStart = now;
      this.requests = 0;
    }
    if (this.requests >= 30 || this.inFlight >= 4) return null;
    this.requests++;
    this.inFlight++;
    try {
      const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash-lite';
      if (!/^gemini-[a-z0-9.-]{1,80}$/.test(model)) return null;
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          signal: AbortSignal.timeout(8000),
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: 'You are a friendly website-help assistant. Rephrase ONLY the supplied approved FAQ answer in plain text, in at most 150 words. Preserve its limitations. Do not invent page names, links, steps, support contacts, or facts. Do not provide investment advice, execute trades, request credentials, or claim access to accounts. Do not add HTML or Markdown links. No tools are available.' }] },
            contents: [{ role: 'user', parts: [{ text: JSON.stringify({ question: entry.question, answer: entry.answer }) }] }],
            generationConfig: { maxOutputTokens: 300, temperature: 0.2 },
          }),
        },
      );
      if (!response.ok) return null;
      const data = await response.json() as {
        candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
      };
      const candidate = data.candidates?.[0];
      if (candidate?.finishReason !== 'STOP') return null;
      const text = candidate.content?.parts?.filter(p => !p.thought)
        .map(p => p.text ?? '').join('').trim();
      // Reject malformed/linked output. This is defense-in-depth, not proof of factuality.
      if (!text || text.length > 2000 || /[<>]|https?:\/\/|\]\(/i.test(text)) return null;
      return text;
    } catch {
      // Never log provider errors: URLs/headers can contain credentials.
      return null;
    } finally {
      this.inFlight--;
    }
  }
}