/**
 * LLM Provider factory.
 * 
 * Creates appropriate provider instance based on LLM_PROVIDER env var.
 * Supports:
 * - Google Gemini (default)
 * - NVIDIA NIM Kimi
 */

import { LLMProvider, LLMProviderClient } from './provider-types.js';
import { GeminiClient } from './providers/gemini.js';
import { NVIDIANIMClient } from './providers/nvidia-nim.js';

export interface ProviderFactoryOptions {
  apiKey: string;
  model: string;
  timeout: number;
  provider?: LLMProvider;
}

export class LLMProviderFactory {
  static createClient(options: ProviderFactoryOptions): LLMProviderClient {
    const provider = options.provider || LLMProvider.GEMINI;

    switch (provider) {
      case LLMProvider.GEMINI:
        return new GeminiClient(options.apiKey, options.model, options.timeout);
      
      case LLMProvider.NVIDIA_NIM:
        return new NVIDIANIMClient(options.apiKey, options.model, options.timeout);
      
      default:
        throw new Error(`Unknown LLM provider: ${provider}`);
    }
  }
}
