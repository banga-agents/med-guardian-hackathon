/**
 * Multi-LLM Agent Service
 * Supports OpenAI, Anthropic, Gemini, and Local LLMs with fallback routing.
 */

import {
  AgentResponse,
  LLMConfig,
  LLMProvider,
  LLMProviderType,
  ProviderDescriptor,
} from './types';
import { getPatientProfileRegistry } from '../patients/PatientProfileRegistry';

// ============================================
// CONFIGURATION
// ============================================

const DEFAULT_CONFIG: LLMConfig = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  temperature: 0.7,
  maxTokens: 500,
  timeout: 30000,
};

const DEFAULT_CHAT_MODELS: Record<LLMProviderType, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-latest',
  gemini: 'gemini-2.0-flash',
  local: 'llama3.2',
};

const DEFAULT_REPORT_MODELS: Record<LLMProviderType, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-3-5-sonnet-latest',
  gemini: 'gemini-1.5-pro',
  local: 'llama3.2',
};

const ALL_PROVIDERS: LLMProviderType[] = ['openai', 'anthropic', 'gemini', 'local'];

type DeterministicFallbackContext = {
  mode: 'patient' | 'support' | 'report';
  prompt: string;
  systemPrompt: string;
  patientId?: string;
  healthData?: unknown;
  supportAudience?: 'patient' | 'clinician';
};

// Patient-specific system prompts
const PATIENT_PROMPTS: Record<string, string> = {
  self: `You are the user's personal MedGuardian profile, checking in from a phone without connected wearables.
You are logging symptoms manually and want concise, accurate summaries that can help a clinician understand trends over time.
Respond clearly, directly, and conversationally.
Keep responses brief (1-2 sentences) and grounded in the symptoms described.`,

  sarah: `You are Sarah Miller, a 28-year-old marketing professional with Type 1 Diabetes.
You use a Dexcom G7 CGM and insulin pump. You're tech-savvy, optimistic, and proactive about your health.
Respond as Sarah would - casual, friendly, and knowledgeable about diabetes management.
Keep responses brief (1-2 sentences) and conversational.`,

  robert: `You are Robert Chen, a 54-year-old software engineering manager with hypertension and sleep apnea.
You have a high-stress job and irregular sleep schedule. You're analytical, detail-oriented, and formal in communication.
Respond with precise, factual information about your symptoms and health status.
Keep responses brief (1-2 sentences) and professional.`,

  emma: `You are Emma Thompson, a 34-year-old UX designer with Long COVID (chronic fatigue, brain fog, occasional palpitations).
You work remotely and have unpredictable symptom flares. You're empathetic, self-aware, and sometimes frustrated with your condition.
Respond authentically about your energy levels and symptoms.
Keep responses brief (1-2 sentences) and honest.`,

  michael: `You are Michael Anderson, a 67-year-old retired teacher with heart arrhythmia (atrial fibrillation).
You live alone and are meticulous about medications. You're polite, traditional, and appreciate clear communication.
Respond respectfully about your heart health and daily routines.
Keep responses brief (1-2 sentences) and courteous.`,
};

// ============================================
// PROVIDERS
// ============================================

class OpenAIProvider implements LLMProvider {
  private apiKey: string;
  private baseURL = 'https://api.openai.com/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateResponse(
    prompt: string,
    systemPrompt: string,
    config: Partial<LLMConfig>
  ): Promise<AgentResponse> {
    const startTime = Date.now();
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };

    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: mergedConfig.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          temperature: mergedConfig.temperature,
          max_tokens: mergedConfig.maxTokens,
        }),
      });

      if (!response.ok) {
        const error = (await response.json()) as { error?: { message?: string } };
        throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`);
      }

      const data = (await response.json()) as {
        choices: { message: { content: string } }[];
        model: string;
        usage?: { total_tokens?: number };
      };

      return {
        text: data.choices?.[0]?.message?.content?.trim() || 'No response generated.',
        provider: 'openai',
        model: data.model,
        latency: Date.now() - startTime,
        tokensUsed: data.usage?.total_tokens,
        timestamp: Date.now(),
      };
    } catch (error: any) {
      return {
        text: 'I apologize, I am temporarily unable to respond.',
        provider: 'openai',
        model: mergedConfig.model,
        latency: Date.now() - startTime,
        error: error.message,
        timestamp: Date.now(),
      };
    }
  }
}

class AnthropicProvider implements LLMProvider {
  private apiKey: string;
  private baseURL = 'https://api.anthropic.com/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateResponse(
    prompt: string,
    systemPrompt: string,
    config: Partial<LLMConfig>
  ): Promise<AgentResponse> {
    const startTime = Date.now();
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };

    try {
      const response = await fetch(`${this.baseURL}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: mergedConfig.model,
          max_tokens: mergedConfig.maxTokens,
          temperature: mergedConfig.temperature,
          system: systemPrompt,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        const error = (await response.json()) as { error?: { message?: string } };
        throw new Error(`Anthropic API error: ${error.error?.message || 'Unknown error'}`);
      }

      const data = (await response.json()) as {
        content?: { text?: string }[];
        model: string;
        usage?: { input_tokens?: number; output_tokens?: number };
      };

      return {
        text: data.content?.[0]?.text?.trim() || 'No response generated.',
        provider: 'anthropic',
        model: data.model,
        latency: Date.now() - startTime,
        tokensUsed: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
        timestamp: Date.now(),
      };
    } catch (error: any) {
      return {
        text: 'I apologize, I am temporarily unable to respond.',
        provider: 'anthropic',
        model: mergedConfig.model,
        latency: Date.now() - startTime,
        error: error.message,
        timestamp: Date.now(),
      };
    }
  }
}

class GeminiProvider implements LLMProvider {
  private apiKey: string;
  private baseURL = 'https://generativelanguage.googleapis.com/v1beta';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateResponse(
    prompt: string,
    systemPrompt: string,
    config: Partial<LLMConfig>
  ): Promise<AgentResponse> {
    const startTime = Date.now();
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };
    const model = mergedConfig.model || DEFAULT_CHAT_MODELS.gemini;

    try {
      const response = await fetch(
        `${this.baseURL}/models/${encodeURIComponent(model)}:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            systemInstruction: {
              role: 'system',
              parts: [{ text: systemPrompt }],
            },
            contents: [
              {
                role: 'user',
                parts: [{ text: prompt }],
              },
            ],
            generationConfig: {
              temperature: mergedConfig.temperature,
              maxOutputTokens: mergedConfig.maxTokens,
            },
          }),
        }
      );

      if (!response.ok) {
        const error = (await response.json()) as {
          error?: { message?: string; status?: string };
        };
        throw new Error(`Gemini API error: ${error.error?.message || response.statusText}`);
      }

      const data = (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
        usageMetadata?: { totalTokenCount?: number };
      };

      const text =
        data.candidates?.[0]?.content?.parts
          ?.map((part) => part.text || '')
          .join('')
          .trim() || 'No response generated.';

      return {
        text,
        provider: 'gemini',
        model,
        latency: Date.now() - startTime,
        tokensUsed: data.usageMetadata?.totalTokenCount,
        timestamp: Date.now(),
      };
    } catch (error: any) {
      return {
        text: 'I apologize, I am temporarily unable to respond.',
        provider: 'gemini',
        model,
        latency: Date.now() - startTime,
        error: error.message,
        timestamp: Date.now(),
      };
    }
  }
}

class LocalLLMProvider implements LLMProvider {
  private baseURL: string;

  constructor(baseURL = 'http://localhost:11434') {
    this.baseURL = baseURL;
  }

  async generateResponse(
    prompt: string,
    systemPrompt: string,
    config: Partial<LLMConfig>
  ): Promise<AgentResponse> {
    const startTime = Date.now();
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };

    try {
      const response = await fetch(`${this.baseURL}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: mergedConfig.model || DEFAULT_CHAT_MODELS.local,
          prompt: `${systemPrompt}\n\nUser: ${prompt}\nAssistant:`,
          stream: false,
          options: {
            temperature: mergedConfig.temperature,
            num_predict: mergedConfig.maxTokens,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Local LLM error: ${response.statusText}`);
      }

      const data = (await response.json()) as { response?: string };
      return {
        text: (data.response || '').trim() || 'No response generated.',
        provider: 'local',
        model: mergedConfig.model || DEFAULT_CHAT_MODELS.local,
        latency: Date.now() - startTime,
        timestamp: Date.now(),
      };
    } catch (error: any) {
      return {
        text: 'I apologize, the local AI model is currently unavailable.',
        provider: 'local',
        model: mergedConfig.model || DEFAULT_CHAT_MODELS.local,
        latency: Date.now() - startTime,
        error: error.message,
        timestamp: Date.now(),
      };
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseURL}/api/tags`);
      const data = (await response.json()) as { models?: { name: string }[] };
      return data.models?.map((m) => m.name) || [];
    } catch {
      return [];
    }
  }
}

// ============================================
// MAIN LLM SERVICE
// ============================================

export class LLMService {
  private providers: Map<LLMProviderType, LLMProvider> = new Map();
  private modelChatMap: Record<LLMProviderType, string> = { ...DEFAULT_CHAT_MODELS };
  private modelReportMap: Record<LLMProviderType, string> = { ...DEFAULT_REPORT_MODELS };
  private defaultProvider: LLMProviderType = 'local';
  private fallbackOrder: LLMProviderType[] = ['local'];
  private deterministicFallbackEnabled: boolean =
    process.env.ENABLE_DETERMINISTIC_LLM_FALLBACK !== 'false';

  constructor(config?: {
    openaiKey?: string;
    anthropicKey?: string;
    geminiKey?: string;
    localURL?: string;
    defaultProvider?: LLMProviderType;
    fallbackOrder?: LLMProviderType[];
    modelChat?: Partial<Record<LLMProviderType, string>>;
    modelReport?: Partial<Record<LLMProviderType, string>>;
  }) {
    if (config?.modelChat) {
      this.modelChatMap = {
        ...this.modelChatMap,
        ...config.modelChat,
      };
    }

    if (config?.modelReport) {
      this.modelReportMap = {
        ...this.modelReportMap,
        ...config.modelReport,
      };
    }

    if (this.hasUsableSecret(config?.openaiKey)) {
      this.providers.set('openai', new OpenAIProvider(config.openaiKey));
    }

    if (this.hasUsableSecret(config?.anthropicKey)) {
      this.providers.set('anthropic', new AnthropicProvider(config.anthropicKey));
    }

    if (this.hasUsableSecret(config?.geminiKey)) {
      this.providers.set('gemini', new GeminiProvider(config.geminiKey));
    }

    this.providers.set('local', new LocalLLMProvider(config?.localURL));

    this.defaultProvider = this.resolveDefaultProvider(config?.defaultProvider);
    this.fallbackOrder = this.resolveFallbackOrder(config?.fallbackOrder);
  }

  /**
   * Generate a response from a patient agent.
   */
  async generateAgentResponse(
    patientId: string,
    query: string,
    context?: {
      recentVitals?: any;
      recentSymptoms?: any;
      currentTime?: string;
    },
    preferredProvider?: LLMProviderType
  ): Promise<AgentResponse> {
    const systemPrompt = this.buildSystemPrompt(patientId, context);
    const chain = this.getProviderChain(preferredProvider);

    return this.runWithFallback(chain, (providerName, provider) =>
      provider.generateResponse(query, systemPrompt, {
        provider: providerName,
        model: this.modelChatMap[providerName],
        temperature: 0.8,
        maxTokens: 180,
      })
    , {
      mode: 'patient',
      prompt: query,
      systemPrompt,
      patientId,
    }
    );
  }

  /**
   * Generate a response as the MedGuardian support agent (not as the patient persona).
   */
  async generateSupportMessage(
    prompt: string,
    context?: {
      patientId?: string;
      guardrails?: string[];
      evidence?: Record<string, unknown>;
      audience?: 'patient' | 'clinician';
    },
    preferredProvider?: LLMProviderType
  ): Promise<AgentResponse> {
    const audience = context?.audience || 'patient';
    const profile = context?.patientId ? getPatientProfileRegistry().getProfile(context.patientId) : undefined;
    const guardrails = [
      'Never diagnose, prescribe, or issue autonomous medical directives.',
      'Only observe patterns, ask clarifying questions, summarize evidence, and recommend clinician escalation when needed.',
      ...(context?.guardrails || []),
    ];

    const systemPrompt = [
      audience === 'clinician'
        ? 'You are MedGuardian Arc, a clinician copilot for evidence-aware triage support.'
        : 'You are MedGuardian Arc, a patient-side health assistant focused on symptom logging, follow-through, and day-to-day support.',
      context?.patientId ? `Patient case: ${context.patientId}.` : null,
      profile
        ? `Patient profile: ${profile.name}, ${profile.age}, focus ${profile.condition}.`
        : null,
      audience === 'clinician'
        ? 'Your tone should be concise, evidence-aware, and suitable for clinician review.'
        : 'Your tone should be concise, calm, empathetic, and practical for the patient.',
      audience === 'clinician'
        ? 'Respond as a clinician-facing assistant. Highlight evidence, uncertainty, monitoring priorities, and when escalation is warranted.'
        : 'Respond as the patient’s assistant. Acknowledge what they reported, help them log relevant details, remind them about active plan items, and encourage escalation if risk is high.',
      `Guardrails: ${guardrails.join(' ')}`,
      context?.evidence ? `Evidence context: ${JSON.stringify(context.evidence)}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const chain = this.getProviderChain(preferredProvider);
    return this.runWithFallback(chain, (providerName, provider) =>
      provider.generateResponse(prompt, systemPrompt, {
        provider: providerName,
        model: this.modelChatMap[providerName],
        temperature: 0.35,
        maxTokens: 220,
      })
    , {
      mode: 'support',
      prompt,
      systemPrompt,
      patientId: context?.patientId,
      supportAudience: audience,
    }
    );
  }

  /**
   * Generate AI health report summary.
   */
  async generateHealthReport(
    patientId: string,
    healthData: any,
    preferredProvider?: LLMProviderType
  ): Promise<AgentResponse> {
    const systemPrompt = `You are a medical AI assistant. Analyze the provided health data and generate a concise summary.
Format your response as JSON with these fields:
- summary: Brief patient overview (2-3 sentences)
- insights: Array of 3-5 key observations
- fhir_bundle: FHIR R4 Bundle JSON string
- recommendations: Array of suggestions
- risk_flags: Array of any concerns

Be professional, accurate, and concise.`;

    const prompt = `Analyze this health data for patient ${patientId}:\n${JSON.stringify(healthData, null, 2)}`;
    const chain = this.getProviderChain(preferredProvider);

    return this.runWithFallback(chain, (providerName, provider) =>
      provider.generateResponse(prompt, systemPrompt, {
        provider: providerName,
        model: this.modelReportMap[providerName],
        temperature: 0.25,
        maxTokens: 1200,
      })
    , {
      mode: 'report',
      prompt,
      systemPrompt,
      patientId,
      healthData,
    }
    );
  }

  async checkAvailability(): Promise<Record<LLMProviderType, boolean>> {
    const availability: Record<LLMProviderType, boolean> = {
      openai: false,
      anthropic: false,
      gemini: false,
      local: false,
    };

    for (const providerName of this.getAvailableProviders()) {
      const provider = this.providers.get(providerName);
      if (!provider) continue;

      try {
        if (providerName === 'local') {
          const models = await (provider as LocalLLMProvider).listModels();
          availability.local = models.length > 0;
          continue;
        }

        const response = await provider.generateResponse(
          'health check',
          'Respond with ok only.',
          {
            model: this.modelChatMap[providerName],
            temperature: 0,
            maxTokens: 8,
          }
        );
        availability[providerName] = !response.error;
      } catch {
        availability[providerName] = false;
      }
    }

    return availability;
  }

  getAvailableProviders(): LLMProviderType[] {
    return Array.from(this.providers.keys());
  }

  getDefaultProvider(): LLMProviderType {
    return this.defaultProvider;
  }

  getFallbackOrder(): LLMProviderType[] {
    return [...this.fallbackOrder];
  }

  getModelMap(): { chat: Record<LLMProviderType, string>; report: Record<LLMProviderType, string> } {
    return {
      chat: { ...this.modelChatMap },
      report: { ...this.modelReportMap },
    };
  }

  async getProviderDescriptors(): Promise<ProviderDescriptor[]> {
    const availableProviders = this.getAvailableProviders();
    const availability = await this.checkAvailability();

    return ALL_PROVIDERS
      .filter((provider) => availableProviders.includes(provider))
      .map((provider) => ({
        provider,
        modelChat: this.modelChatMap[provider],
        modelReport: this.modelReportMap[provider],
        configured: this.providers.has(provider),
        available: availability[provider],
        isDefault: provider === this.defaultProvider,
        fallbackOrder: this.fallbackOrder.indexOf(provider),
      }));
  }

  setDefaultProvider(provider: LLMProviderType): void {
    if (!this.providers.has(provider)) {
      throw new Error(`Provider ${provider} not available`);
    }
    this.defaultProvider = provider;

    if (!this.fallbackOrder.includes(provider)) {
      this.fallbackOrder.unshift(provider);
    }
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  private resolveDefaultProvider(candidate?: LLMProviderType): LLMProviderType {
    if (candidate && this.providers.has(candidate)) {
      return candidate;
    }

    if (this.providers.has('openai')) return 'openai';
    if (this.providers.has('anthropic')) return 'anthropic';
    if (this.providers.has('gemini')) return 'gemini';
    return 'local';
  }

  private resolveFallbackOrder(order?: LLMProviderType[]): LLMProviderType[] {
    const requested = order || [this.defaultProvider, 'gemini', 'openai', 'anthropic', 'local'];
    const normalized: LLMProviderType[] = [];

    for (const provider of requested) {
      if (!this.providers.has(provider)) continue;
      if (!normalized.includes(provider)) normalized.push(provider);
    }

    for (const provider of this.providers.keys()) {
      if (!normalized.includes(provider)) {
        normalized.push(provider);
      }
    }

    return normalized.length ? normalized : [this.defaultProvider];
  }

  private getProviderChain(preferred?: LLMProviderType): LLMProviderType[] {
    const chain: LLMProviderType[] = [];

    if (preferred && this.providers.has(preferred)) {
      chain.push(preferred);
    }

    if (!chain.includes(this.defaultProvider) && this.providers.has(this.defaultProvider)) {
      chain.push(this.defaultProvider);
    }

    for (const provider of this.fallbackOrder) {
      if (this.providers.has(provider) && !chain.includes(provider)) {
        chain.push(provider);
      }
    }

    if (!chain.length) {
      throw new Error('No LLM providers available');
    }

    return chain;
  }

  private async runWithFallback(
    chain: LLMProviderType[],
    execute: (providerName: LLMProviderType, provider: LLMProvider) => Promise<AgentResponse>,
    fallbackContext?: DeterministicFallbackContext
  ): Promise<AgentResponse> {
    const errors: string[] = [];

    for (const providerName of chain) {
      const provider = this.providers.get(providerName);
      if (!provider) continue;

      const response = await execute(providerName, provider);
      if (!response.error) {
        return response;
      }

      errors.push(`${providerName}: ${response.error}`);
    }

    if (this.deterministicFallbackEnabled && fallbackContext) {
      return this.buildDeterministicFallbackResponse(chain, errors, fallbackContext);
    }

    return {
      text: 'I apologize, all configured AI providers are currently unavailable.',
      provider: chain[0],
      model: 'fallback-failed',
      latency: 0,
      error: errors.join(' | '),
      timestamp: Date.now(),
    };
  }

  private hasUsableSecret(value?: string): value is string {
    if (!value) return false;
    const normalized = value.trim();
    if (!normalized) return false;

    const lower = normalized.toLowerCase();
    const exactPlaceholders = new Set([
      'sk-your-openai-api-key',
      'sk-ant-your-anthropic-key',
      'your-gemini-api-key',
      'your_openai_api_key',
      'your_anthropic_key',
      'your_gemini_api_key',
      'your-key',
      'changeme',
      'replace-me',
    ]);

    if (exactPlaceholders.has(lower)) return false;
    if (lower.startsWith('your-') || lower.startsWith('your_')) return false;
    if (lower.includes('placeholder')) return false;
    if (lower.includes('replace-with')) return false;

    return true;
  }

  private buildDeterministicFallbackResponse(
    chain: LLMProviderType[],
    errors: string[],
    context: DeterministicFallbackContext
  ): AgentResponse {
    const resolvedPatientId =
      context.patientId ||
      (context.prompt.match(/patient\s+([a-z]+)/i)?.[1]?.toLowerCase() ?? undefined);

    let text: string;

    if (context.mode === 'report') {
      const vitalsCount = Array.isArray((context.healthData as any)?.vitals)
        ? (context.healthData as any).vitals.length
        : 0;
      const symptomCount = Array.isArray((context.healthData as any)?.symptoms)
        ? (context.healthData as any).symptoms.length
        : 0;
      const payload = {
        summary:
          `Deterministic fallback summary for ${resolvedPatientId || 'patient'} with ${vitalsCount} vitals and ${symptomCount} symptom entries. ` +
          'Clinician confirmation is recommended before acting on this summary.',
        insights: [
          'Data ingestion and retrieval are operational.',
          'AI provider outage fallback mode was used.',
          'Escalate to clinician review for final interpretation.',
        ],
        fhir_bundle: JSON.stringify({ resourceType: 'Bundle', type: 'collection', entry: [] }),
        recommendations: [
          'Continue monitoring and collect additional readings.',
          'Validate findings with a qualified clinician.',
          'Escalate immediately if severe symptoms appear.',
        ],
        risk_flags: symptomCount > 0 ? ['requires_clinician_review'] : ['monitoring_only'],
      };
      text = JSON.stringify(payload);
    } else if (context.mode === 'support') {
      if (context.supportAudience === 'clinician') {
        const profile = resolvedPatientId ? getPatientProfileRegistry().getProfile(resolvedPatientId) : undefined;
        text = [
          profile
            ? `Patient: ${profile.name}, ${profile.age}, focus ${profile.condition}.`
            : 'Patient case available for clinician review.',
          'Validation priorities: confirm timeline and severity of current symptoms, review adherence or missed medication windows, and check for trigger context such as meals, exertion, or poor sleep.',
          'Escalate promptly if symptoms are worsening, persistent, or include urgent red-flag features.',
          'Final treatment and urgency decisions should stay with the clinician.',
        ].join(' ');
      } else {
        text =
          'I can help you track symptoms, follow your care plan, and note when clinician review is needed. ' +
          'If symptoms worsen or feel urgent, contact a clinician right away.';
      }
    } else {
      const query = context.prompt.toLowerCase();
      const urgentPattern = /(chest pain|shortness of breath|faint|collapse|severe|unconscious)/i;
      if (urgentPattern.test(query)) {
        text =
          'I am feeling concerning symptoms right now and want immediate clinician guidance. ' +
          'Please escalate this case urgently.';
      } else {
        switch (resolvedPatientId) {
          case 'self':
            text =
              'I am logging symptoms manually from my phone and want a clinician to see the trend clearly. ' +
              'I can share timing, severity, and anything that seems to trigger it.';
            break;
          case 'sarah':
            text =
              'My glucose has been fluctuating today and I feel a bit fatigued. ' +
              'I can share the latest readings and timing for review.';
            break;
          case 'robert':
            text =
              'My blood pressure feels elevated today with a mild headache. ' +
              'I can provide recent readings and timing details.';
            break;
          case 'emma':
            text =
              'My energy is low with some brain fog today, especially after activity. ' +
              'I would like clinician guidance on next steps.';
            break;
          case 'michael':
            text =
              'I noticed intermittent palpitations today but no sustained episode. ' +
              'I can share timing and possible triggers for review.';
            break;
          default:
            text =
              'I noticed symptom changes and can share details on timing and severity. ' +
              'Please have a clinician review this case.';
        }
      }
    }

    return {
      text,
      provider: chain[0] || 'local',
      model: 'deterministic-fallback',
      latency: 0,
      error: errors.join(' | '),
      timestamp: Date.now(),
    };
  }

  private buildSystemPrompt(patientId: string, context?: any): string {
    let prompt = PATIENT_PROMPTS[patientId];

    if (!prompt) {
      const profile = getPatientProfileRegistry().getProfile(patientId);
      if (profile) {
        const history = profile.medicalHistory.length
          ? `Medical history: ${profile.medicalHistory.slice(0, 2).join(', ')}.`
          : '';
        const meds = profile.medications.length
          ? `Current medications: ${profile.medications.slice(0, 2).join(', ')}.`
          : '';
        prompt = [
          `You are ${profile.name}, a ${profile.age}-year-old patient using MedGuardian.`,
          `Your main condition or monitoring focus is ${profile.condition}.`,
          history,
          meds,
          'Respond naturally as the patient in 1-2 concise sentences.',
          'Be concrete about symptoms, timing, and context when asked.',
        ]
          .filter(Boolean)
          .join(' ');
      } else {
        prompt =
          'You are a patient using MedGuardian for symptom journaling and clinician follow-up. ' +
          'Respond naturally, briefly, and concretely about symptoms, timing, and context.';
      }
    }

    if (context) {
      prompt += '\n\nCurrent context:';

      if (context.recentVitals) {
        prompt += `\n- Recent vitals: ${JSON.stringify(context.recentVitals)}`;
      }
      if (context.recentSymptoms) {
        prompt += `\n- Recent symptoms: ${JSON.stringify(context.recentSymptoms)}`;
      }
      if (context.currentTime) {
        prompt += `\n- Current time: ${context.currentTime}`;
      }
      if (context.contextualFactors) {
        prompt += `\n- Contextual factors: ${JSON.stringify(context.contextualFactors)}`;
      }
    }

    prompt += '\n\nRemember to stay in character and respond naturally.';
    return prompt;
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

let llmService: LLMService | null = null;

export function initLLMService(config?: {
  openaiKey?: string;
  anthropicKey?: string;
  geminiKey?: string;
  localURL?: string;
  defaultProvider?: LLMProviderType;
  fallbackOrder?: LLMProviderType[];
  modelChat?: Partial<Record<LLMProviderType, string>>;
  modelReport?: Partial<Record<LLMProviderType, string>>;
}): LLMService {
  if (!llmService) {
    llmService = new LLMService(config);
  }
  return llmService;
}

export function getLLMService(): LLMService {
  if (!llmService) {
    throw new Error('LLM Service not initialized. Call initLLMService first.');
  }
  return llmService;
}
