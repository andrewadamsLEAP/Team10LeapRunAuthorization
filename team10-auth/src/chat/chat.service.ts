import { Inject, Injectable } from '@nestjs/common';
import { ChatProvider } from './chat.provider.js';
import { SITE_HELP } from './site-help.js';

export type ChatReply = {
  reply: string;
  sources: string[];
  fallback: boolean;
  mode: 'faq' | 'gemini';
};

@Injectable()
export class ChatService {
  constructor(@Inject(ChatProvider) private readonly provider: ChatProvider) {}

  async message(message: string): Promise<ChatReply> {
    const fallback = (reply: string): ChatReply => ({ reply, sources: [], fallback: true, mode: 'faq' });
    // All matching is local. Even undetected private data NEVER enters provider input.
    if (/bearer\s+\S+|eyJ[a-zA-Z0-9_-]+\.|\$2[aby]\$|(?:api[_ -]?key|password)\s*[:=]\s*\S+|my password is\s+\S+/i.test(message)) {
      return fallback('Please do not share passwords, tokens, account details, or financial data in chat. Use the secure account pages or contact the site support team.');
    }
    if (/\b(investment advice|best stock|predict|profitable)\b|\b(should i|recommend\w*)\b.*\b(buy|sell|invest|stock|investment)\b|\b(buy|sell|place|execute|cancel)\b.*\b(for me|on my behalf)\b/i.test(message)) {
      return fallback('I can only explain approved site-help instructions. I cannot provide investment advice, place or cancel orders, or make trades. Please contact the site support team for help not covered here.');
    }
    const normalized = message.toLowerCase().replace(/[’']/g, '').replace(/log[ -]?in/g, 'login').replace(/sign[ -]?in/g, 'signin').replace(/sign[ -]?up/g, 'signup').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const words = ` ${normalized} `;
    const matches = SITE_HELP.filter(entry => entry.terms.some(term => words.includes(` ${term} `)));
    // Broad scope words must not override an unknown or draft topic.
    const specific = matches.filter(entry => entry.id !== 'help-scope' && entry.approved);
    // Match whole conversational greetings, not arbitrary messages containing "help".
    // This prevents "hello, tell me about taxes" from gaining an approved source.
    const greeting = /^(hi|hello|hey)( there)?( chatbert)?( how are you)?$/.test(normalized);
    const scopeQuestion = /^(help|help me|can you help me|what can you do|what do you do|how can you help( me)?|what can you help( me)? with|what is this (site|website)|how (do i|can i|to) (use|navigate) (this|the) (site|website)|help me navigate the site)$/.test(normalized);
    const entry = specific.length === 1 ? specific[0] : specific.length > 1 ? {
      id: specific.map(item => item.id).join('+'), approved: true, terms: [],
      question: specific.map(item => item.question).join('\n'),
      answer: specific.map(item => item.answer).join('\n\n'),
    }
      : specific.length === 0 && (greeting || scopeQuestion)
        ? SITE_HELP[0] : undefined;
    if (!entry?.approved) {
      return fallback('I don’t know the answer to that yet. I can help with registration, signing in, password requirements, holdings, orders, transactions, and basic site troubleshooting. Please ask about one of those, or contact the site support team.');
    }
    const generated = await this.provider.rewrite(entry);
    return { reply: generated ?? entry.answer, sources: specific.length ? specific.map(item => item.id) : [entry.id], fallback: generated === null, mode: generated ? 'gemini' : 'faq' };
  }
}