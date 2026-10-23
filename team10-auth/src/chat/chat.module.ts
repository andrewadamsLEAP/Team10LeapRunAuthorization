import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { ChatProvider, GeminiChatProvider } from './chat.provider.js';
import { ChatRateGuard } from './chat-rate.guard.js';

@Module({
  controllers: [ChatController],
  providers: [ChatService, ChatRateGuard, { provide: ChatProvider, useClass: GeminiChatProvider }],
})
export class ChatModule {}