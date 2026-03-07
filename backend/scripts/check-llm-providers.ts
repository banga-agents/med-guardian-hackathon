/**
 * Script to check LLM provider availability
 * Run with: npm run agent:check
 */

import { initLLMService } from '../src/services/agent/LLMService';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import type { LLMProviderType } from '../src/services/agent/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const providerNames: LLMProviderType[] = ['openai', 'anthropic', 'gemini', 'local'];
const parseFallbackOrder = (raw?: string): LLMProviderType[] | undefined => {
  if (!raw) return undefined;
  const values = raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is LLMProviderType => providerNames.includes(item as LLMProviderType));
  return values.length ? values : undefined;
};

async function checkProviders() {
  console.log('🔍 Checking LLM Provider Availability...\n');
  
  const llmService = initLLMService({
    openaiKey: process.env.OPENAI_API_KEY,
    anthropicKey: process.env.ANTHROPIC_API_KEY,
    geminiKey: process.env.GEMINI_API_KEY,
    localURL: process.env.LOCAL_LLM_URL || 'http://localhost:11434',
    defaultProvider: (process.env.DEFAULT_LLM_PROVIDER as LLMProviderType) || 'openai',
    fallbackOrder: parseFallbackOrder(process.env.LLM_FALLBACK_ORDER),
    modelChat: {
      openai: process.env.OPENAI_MODEL_CHAT || 'gpt-4o-mini',
      anthropic: process.env.ANTHROPIC_MODEL_CHAT || 'claude-3-5-haiku-latest',
      gemini: process.env.GEMINI_MODEL_CHAT || 'gemini-2.0-flash',
      local: process.env.LOCAL_MODEL_CHAT || 'llama3.2',
    },
    modelReport: {
      openai: process.env.OPENAI_MODEL_REPORT || 'gpt-4o',
      anthropic: process.env.ANTHROPIC_MODEL_REPORT || 'claude-3-5-sonnet-latest',
      gemini: process.env.GEMINI_MODEL_REPORT || 'gemini-1.5-pro',
      local: process.env.LOCAL_MODEL_REPORT || process.env.LOCAL_MODEL_CHAT || 'llama3.2',
    },
  });
  const availability = await llmService.checkAvailability();
  const providers = llmService.getAvailableProviders();
  const fallbackOrder = llmService.getFallbackOrder();
  const defaultProvider = llmService.getDefaultProvider();
  const modelMap = llmService.getModelMap();
  
  console.log('Available Providers:');
  console.log('═══════════════════════════════════════');
  
  for (const [name, isAvailable] of Object.entries(availability)) {
    const status = isAvailable ? '✅ Available' : '❌ Unavailable';
    console.log(`  ${name.padEnd(12)} ${status}`);
  }
  
  console.log('\nActive Providers:', providers.join(', ') || 'None');
  console.log(`Default Provider: ${defaultProvider}`);
  console.log(`Fallback Order: ${fallbackOrder.join(' -> ')}`);
  console.log('Model Map:', modelMap);
  
  // Test a simple query if any provider is available
  const availableProviders = Object.entries(availability)
    .filter(([_, available]) => available)
    .map(([name]) => name);
  
  if (availableProviders.length > 0) {
    console.log('\n🧪 Testing query with first available provider...\n');
    
    try {
      const response = await llmService.generateAgentResponse(
        'sarah',
        'Hello, how are you feeling today?',
        undefined,
        availableProviders[0] as any
      );
      
      console.log('Response:');
      console.log('─────────────────────────────────────');
      console.log(response.text);
      console.log('─────────────────────────────────────');
      console.log(`\nLatency: ${response.latency}ms`);
      console.log(`Provider: ${response.provider}`);
      console.log(`Model: ${response.model}`);
    } catch (error: any) {
      console.error('Test failed:', error.message);
    }
  } else {
    console.log('\n⚠️  No LLM providers available!');
    console.log('   Set one of these environment variables:');
    console.log('   • GEMINI_API_KEY - for Gemini');
    console.log('   • OPENAI_API_KEY - for OpenAI');
    console.log('   • ANTHROPIC_API_KEY - for Anthropic');
    console.log('   • Start Ollama on localhost:11434 - for local LLMs');
  }
  
  process.exit(0);
}

checkProviders().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
