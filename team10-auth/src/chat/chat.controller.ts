import { BadRequestException, Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ChatRateGuard } from './chat-rate.guard.js';
import { ChatService } from './chat.service.js';

@ApiTags('Site help')
@Controller('chat')
@UseGuards(ChatRateGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post('message')
  @HttpCode(200)
  @ApiOperation({ summary: 'Public site help; never submit credentials or financial data' })
  @ApiBody({ schema: { type: 'object', additionalProperties: false, required: ['message'], properties: { message: { type: 'string', minLength: 1, maxLength: 1000 } } } })
  @ApiResponse({ status: 200, description: 'Plain-text reply, FAQ source IDs, fallback flag, and mode (faq or gemini).' })
  @ApiResponse({ status: 400, description: 'Invalid message body.' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded. Retry-After header supplied.' })
  async message(@Body() body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).length !== 1 || !('message' in body)
      || typeof body.message !== 'string' || !body.message.trim()
      || body.message.length > 1000 || Buffer.byteLength(body.message, 'utf8') > 4000
      || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(body.message)) {
      throw new BadRequestException('Send only a message string containing 1–1000 characters (maximum 4000 UTF-8 bytes).');
    }
    return this.chat.message(body.message.trim());
  }
}