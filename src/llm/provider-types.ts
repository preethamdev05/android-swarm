/**
 * LLM Provider abstraction types.
 * 
 * Supports multiple LLM backends with unified interface:
 * - Google Gemini: 2M context, faster, lower cost
 * - NVIDIA NIM Kimi: 256K context, reasoning-focused, thinking mode
 * 
 * Add new providers by implementing LLMProviderClient interface.
 */

export enum LLMProvider {
  GEMINI = 'gemini',
  NVIDIA_NIM = 'nvidia_nim'
}

export type ProviderConfigType = 'gemini' | 'nvidia_nim';

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model: string;
  endpoint: string;
  timeout: number;
}

export interface LLMRequest {
  messages: Array<{ role: string; content: string }>;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
}

export interface LLMResponse {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
}

export interface LLMProviderClient {
  chat(request: LLMRequest): Promise<LLMResponse>;
  getAPICallCount(): number;
  resetAPICallCount(): void;
}
