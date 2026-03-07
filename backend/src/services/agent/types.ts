/**
 * Agent Service Types
 */

export type LLMProviderType = 'openai' | 'anthropic' | 'gemini' | 'local';

export interface LLMConfig {
  provider: LLMProviderType;
  model: string;
  temperature: number;
  maxTokens: number;
  timeout: number;
}

export interface AgentResponse {
  text: string;
  provider: LLMProviderType | string;
  model: string;
  latency: number;
  tokensUsed?: number;
  error?: string;
  timestamp: number;
}

export interface ProviderDescriptor {
  provider: LLMProviderType;
  modelChat: string;
  modelReport: string;
  configured: boolean;
  available: boolean;
  isDefault: boolean;
  fallbackOrder: number;
}

export interface LLMProvider {
  generateResponse(
    prompt: string,
    systemPrompt: string,
    config: Partial<LLMConfig>
  ): Promise<AgentResponse>;
}

export interface PatientAgentConfig {
  id: string;
  name: string;
  age: number;
  condition: string;
  personality: string;
  responseStyle: 'brief' | 'detailed' | 'casual' | 'formal';
  preferredProvider?: LLMProviderType;
}

export interface AgentQuery {
  id: string;
  patientId: string;
  query: string;
  response?: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  timestamp: number;
  latency?: number;
  provider?: LLMProviderType;
}

export interface HealthReportRequest {
  patientId: string;
  healthData: {
    vitals: any[];
    symptoms: any[];
    medications?: any[];
    period: {
      start: number;
      end: number;
    };
  };
  preferredProvider?: LLMProviderType;
}

export interface HealthReportResponse extends AgentResponse {
  summary: string;
  insights: string[];
  fhirBundle?: string;
  recommendations: string[];
  riskFlags: string[];
}
