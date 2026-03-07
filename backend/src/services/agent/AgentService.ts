/**
 * Patient Agent Service
 * Manages AI agents for simulated patients
 */

import { EventEmitter } from 'events';
import { LLMService, getLLMService } from './LLMService';
import { AgentKernel } from './kernel/AgentKernel';
import { 
  PatientAgentConfig, 
  AgentQuery, 
  HealthReportRequest,
  LLMProviderType,
  ProviderDescriptor,
} from './types';

export type AgentRuntimeMode = 'legacy' | 'akasha';

export class AgentService extends EventEmitter {
  private llmService: LLMService;
  private activeQueries: Map<string, AgentQuery> = new Map();
  private patientConfigs: Map<string, PatientAgentConfig> = new Map();
  private agentMode: AgentRuntimeMode;
  private kernel: AgentKernel | null = null;

  constructor(config?: { mode?: AgentRuntimeMode }) {
    super();
    this.llmService = getLLMService();
    this.agentMode = config?.mode || (process.env.AGENT_MODE === 'akasha' ? 'akasha' : 'legacy');
    if (this.agentMode === 'akasha') {
      try {
        this.kernel = new AgentKernel();
      } catch (error: any) {
        console.warn(`⚠️ Agent kernel initialization failed, falling back to legacy mode: ${error.message}`);
        this.agentMode = 'legacy';
      }
    }
    this.initializePatientConfigs();
  }

  // ============================================
  // PATIENT AGENT QUERIES
  // ============================================

  /**
   * Send a query to a patient agent
   */
  async queryPatient(
    patientId: string,
    query: string,
    context?: {
      recentVitals?: any;
      recentSymptoms?: any;
      contextualFactors?: any;
    },
    preferredProvider?: LLMProviderType
  ): Promise<AgentQuery> {
    const queryId = `query-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const caseId = `patient:${patientId}`;
    
    const agentQuery: AgentQuery = {
      id: queryId,
      patientId,
      query,
      status: 'pending',
      timestamp: Date.now(),
    };

    this.activeQueries.set(queryId, agentQuery);
    this.emit('query:started', agentQuery);

    const governanceDecision = this.kernel?.evaluateAction({
      caseId,
      actionType: 'chat',
      actionName: 'agent.query',
      channel: 'chat',
      risk: 'medium',
      consentActive: true,
      consentInScope: true,
      containsPhi: false,
      externalOutput: false,
      onchainWrite: false,
      requiresApproval: false,
      approvalPresent: true,
      autonomousMedicalAction: false,
      emergencySignals: false,
      metadata: {
        preferredProvider: preferredProvider || this.getDefaultProvider(),
        queryLength: query.length,
      },
    });

    this.kernel?.appendAudit({
      actorType: 'doctor',
      actorId: 'simulation_doctor',
      caseId,
      actionType: 'chat',
      actionName: 'query_received',
      risk: 'medium',
      decision: governanceDecision?.mode || 'allow',
      inputHash: this.kernel?.hashInput({ query, context }),
      ruleChecks: governanceDecision?.triggeredRules || [],
      metadata: {
        patientId,
      },
    });

    this.kernel?.remember({
      caseId,
      category: 'incoming_query',
      content: query,
      sourceType: 'doctor',
      sourceId: 'simulation_doctor',
      provenance: {
        preferredProvider: preferredProvider || 'default',
      },
    });

    if (governanceDecision?.mode === 'block') {
      agentQuery.status = 'completed';
      agentQuery.response = `Action blocked by governance policy. Rules: ${governanceDecision.triggeredRules.join(', ') || 'n/a'}.`;
      this.emit('query:blocked', { ...agentQuery, reason: governanceDecision.reason });
      return agentQuery;
    }

    if (governanceDecision?.mode === 'needs_approval') {
      agentQuery.status = 'completed';
      agentQuery.response = `Action requires clinician approval before execution. Rules: ${governanceDecision.triggeredRules.join(', ') || 'n/a'}.`;
      this.emit('query:needsApproval', { ...agentQuery, reason: governanceDecision.reason });
      return agentQuery;
    }

    try {
      agentQuery.status = 'processing';
      this.emit('query:processing', agentQuery);

      // Generate response using LLM
      const response = await this.llmService.generateAgentResponse(
        patientId,
        query,
        {
          ...context,
          currentTime: new Date().toLocaleTimeString(),
        },
        preferredProvider
      );

      agentQuery.response = response.text;
      agentQuery.latency = response.latency;
      agentQuery.provider = response.provider as LLMProviderType;
      agentQuery.status = 'completed';

      this.emit('query:completed', agentQuery);

      this.kernel?.remember({
        caseId,
        category: 'agent_response',
        content: response.text,
        sourceType: 'agent',
        sourceId: String(response.provider),
        provenance: {
          latency: response.latency,
          provider: response.provider,
          model: response.model,
          tokensUsed: response.tokensUsed,
        },
      });

      this.kernel?.appendAudit({
        actorType: 'agent',
        actorId: String(response.provider),
        caseId,
        actionType: 'chat',
        actionName: 'query_completed',
        risk: 'medium',
        decision: 'allow',
        outputHash: this.kernel?.hashOutput(response.text),
        ruleChecks: governanceDecision?.triggeredRules || [],
        metadata: {
          provider: response.provider,
          latency: response.latency,
          model: response.model,
          fallbackError: response.error,
        },
      });
      
      // Simulate realistic delay for natural conversation
      if (response.latency < 500) {
        await this.delay(500 + Math.random() * 1000);
      }

    } catch (error: any) {
      agentQuery.status = 'error';
      agentQuery.response = 'I apologize, I am unable to respond right now.';
      this.emit('query:error', agentQuery, error);
      this.kernel?.appendAudit({
        actorType: 'agent',
        actorId: 'agent-core',
        caseId,
        actionType: 'chat',
        actionName: 'query_error',
        risk: 'medium',
        decision: 'block',
        inputHash: this.kernel?.hashInput({ query, context }),
        metadata: {
          error: error.message,
        },
      });
    }

    return agentQuery;
  }

  async querySupport(
    patientId: string,
    query: string,
    context?: {
      recentVitals?: any;
      recentSymptoms?: any;
      contextualFactors?: any;
    },
    preferredProvider?: LLMProviderType,
    audience: 'patient' | 'clinician' = 'clinician'
  ): Promise<AgentQuery> {
    const queryId = `support-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const agentQuery: AgentQuery = {
      id: queryId,
      patientId,
      query,
      status: 'pending',
      timestamp: Date.now(),
    };

    this.activeQueries.set(queryId, agentQuery);
    this.emit('query:started', agentQuery);

    try {
      agentQuery.status = 'processing';
      this.emit('query:processing', agentQuery);

      const response = await this.llmService.generateSupportMessage(
        query,
        {
          patientId,
          audience,
          evidence: context
            ? {
                recentVitals: context.recentVitals,
                recentSymptoms: context.recentSymptoms,
                contextualFactors: context.contextualFactors,
              }
            : undefined,
        },
        preferredProvider
      );

      agentQuery.response = response.text;
      agentQuery.latency = response.latency;
      agentQuery.provider = response.provider as LLMProviderType;
      agentQuery.status = 'completed';
      this.emit('query:completed', agentQuery);
    } catch (error: any) {
      agentQuery.status = 'error';
      agentQuery.response = 'I am unable to respond right now.';
      this.emit('query:error', agentQuery, error);
    }

    return agentQuery;
  }

  /**
   * Generate a proactive message from patient agent
   * (e.g., "I'm feeling dizzy, should I be concerned?")
   */
  async generateProactiveMessage(
    patientId: string,
    trigger: {
      type: 'vital_alert' | 'symptom_onset' | 'medication_reminder' | 'routine_check';
      data: any;
    }
  ): Promise<string> {
    const caseId = `patient:${patientId}`;
    let prompt = '';

    switch (trigger.type) {
      case 'vital_alert':
        prompt = `Patient ${patientId} has ${trigger.data.metric}=${trigger.data.value} (${trigger.data.status}). Ask one concise clarifying question to understand symptoms, possible triggers, and immediate impact.`;
        break;
      case 'symptom_onset':
        prompt = `Patient ${patientId} shows symptom onset context: ${JSON.stringify(trigger.data)}. Ask one empathetic follow-up question focused on timeline, severity, and daily-function impact.`;
        break;
      case 'medication_reminder':
        prompt = `Send a short medication adherence check-in for ${trigger.data.medication}. Ask if it was taken and whether side effects occurred.`;
        break;
      case 'routine_check':
        prompt = `Send a brief routine check-in question for patient ${patientId}, asking for any symptom changes since the last update.`;
        break;
    }

    const governanceDecision = this.kernel?.evaluateAction({
      caseId,
      actionType: 'chat',
      actionName: 'agent.proactive_message',
      channel: 'simulation',
      risk: trigger.type === 'vital_alert' || trigger.type === 'symptom_onset' ? 'high' : 'low',
      consentActive: true,
      consentInScope: true,
      containsPhi: false,
      externalOutput: false,
      onchainWrite: false,
      requiresApproval: false,
      approvalPresent: true,
      autonomousMedicalAction: false,
      emergencySignals: trigger.type === 'symptom_onset',
      metadata: {
        triggerType: trigger.type,
      },
    });

    this.kernel?.remember({
      caseId,
      category: 'proactive_prompt',
      content: prompt,
      sourceType: 'agent',
      sourceId: 'agent-core',
      provenance: {
        triggerType: trigger.type,
      },
    });

    if (governanceDecision?.mode === 'block') {
      return 'I detected a policy restriction and escalated this to your care team.';
    }

    const response = await this.llmService.generateSupportMessage(
      prompt,
      {
        patientId,
        audience: 'patient',
      }
    );

    this.kernel?.appendAudit({
      actorType: 'agent',
      actorId: String(response.provider),
      caseId,
      actionType: 'chat',
      actionName: 'proactive_message_generated',
      risk: trigger.type === 'vital_alert' || trigger.type === 'symptom_onset' ? 'high' : 'low',
      decision: governanceDecision?.mode || 'allow',
      inputHash: this.kernel?.hashInput({ trigger, prompt }),
      outputHash: this.kernel?.hashOutput(response.text),
      ruleChecks: governanceDecision?.triggeredRules || [],
      metadata: {
        provider: response.provider,
        latency: response.latency,
      },
    });

    return response.text;
  }

  /**
   * Simulate a patient response to an agent prompt, using patient persona profile.
   */
  async generatePatientReply(
    patientId: string,
    agentPrompt: string,
    context?: {
      recentVitals?: any;
      recentSymptoms?: any;
      contextualFactors?: any;
    },
    preferredProvider?: LLMProviderType
  ): Promise<string> {
    const caseId = `patient:${patientId}`;
    const prompt = [
      'Your MedGuardian support agent asked:',
      `"${agentPrompt}"`,
      'Reply as the patient in 1-2 concise sentences.',
      'Include concrete symptom details and timing when possible.',
      'Do not mention being a simulation.',
    ].join('\n');

    const response = await this.llmService.generateAgentResponse(
      patientId,
      prompt,
      {
        ...context,
        currentTime: new Date().toLocaleTimeString(),
      },
      preferredProvider || this.patientConfigs.get(patientId)?.preferredProvider
    );

    this.kernel?.remember({
      caseId,
      category: 'patient_reply',
      content: response.text,
      sourceType: 'patient',
      sourceId: patientId,
      provenance: {
        provider: response.provider,
        latency: response.latency,
      },
    });

    this.kernel?.appendAudit({
      actorType: 'patient',
      actorId: patientId,
      caseId,
      actionType: 'chat',
      actionName: 'patient_reply_generated',
      risk: 'medium',
      decision: 'allow',
      outputHash: this.kernel?.hashOutput(response.text),
      metadata: {
        provider: response.provider,
        latency: response.latency,
      },
    });

    return response.text;
  }

  // ============================================
  // HEALTH REPORT GENERATION
  // ============================================

  /**
   * Generate AI health report for a patient
   */
  async generateHealthReport(request: HealthReportRequest) {
    const caseId = `patient:${request.patientId}`;
    this.kernel?.appendAudit({
      actorType: 'doctor',
      actorId: 'report_request',
      caseId,
      actionType: 'workflow',
      actionName: 'health_report_requested',
      risk: 'high',
      decision: 'allow',
      inputHash: this.kernel?.hashInput(request.healthData),
      metadata: {
        preferredProvider: request.preferredProvider || 'default',
      },
    });

    return this.llmService.generateHealthReport(
      request.patientId,
      request.healthData,
      request.preferredProvider
    );
  }

  // ============================================
  // PROVIDER MANAGEMENT
  // ============================================

  /**
   * Check which LLM providers are available
   */
  async checkProviderAvailability(): Promise<Record<string, boolean>> {
    return this.llmService.checkAvailability();
  }

  getDefaultProvider(): LLMProviderType {
    return this.llmService.getDefaultProvider();
  }

  getFallbackOrder(): LLMProviderType[] {
    return this.llmService.getFallbackOrder();
  }

  getModelMap(): { chat: Record<LLMProviderType, string>; report: Record<LLMProviderType, string> } {
    return this.llmService.getModelMap();
  }

  async getProviderCatalog(): Promise<ProviderDescriptor[]> {
    return this.llmService.getProviderDescriptors();
  }

  /**
   * Get available providers
   */
  getAvailableProviders(): LLMProviderType[] {
    return this.llmService.getAvailableProviders();
  }

  /**
   * Set default LLM provider
   */
  setDefaultProvider(provider: LLMProviderType): void {
    this.llmService.setDefaultProvider(provider);
  }

  getAgentMode(): AgentRuntimeMode {
    return this.agentMode;
  }

  getKernelStatus() {
    return this.kernel?.getStatus() || { mode: this.agentMode, enabled: false };
  }

  getCaseTimeline(patientId: string, limit = 40) {
    if (!this.kernel) {
      return {
        caseId: `patient:${patientId}`,
        memory: [],
        audit: [],
      };
    }
    return this.kernel.getCaseTimeline(`patient:${patientId}`, limit);
  }

  // ============================================
  // QUERY MANAGEMENT
  // ============================================

  /**
   * Get active query by ID
   */
  getQuery(queryId: string): AgentQuery | undefined {
    return this.activeQueries.get(queryId);
  }

  /**
   * Get all queries for a patient
   */
  getPatientQueries(patientId: string): AgentQuery[] {
    return Array.from(this.activeQueries.values())
      .filter(q => q.patientId === patientId)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Clear old queries
   */
  clearOldQueries(maxAgeMs: number = 3600000): void {
    const cutoff = Date.now() - maxAgeMs;
    for (const [id, query] of this.activeQueries) {
      if (query.timestamp < cutoff) {
        this.activeQueries.delete(id);
      }
    }
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  private initializePatientConfigs(): void {
    const configs: PatientAgentConfig[] = [
      {
        id: 'self',
        name: 'Personal Profile',
        age: 33,
        condition: 'General Symptom Monitoring',
        personality: 'direct, reflective, phone-first',
        responseStyle: 'brief',
        preferredProvider: 'gemini',
      },
      {
        id: 'sarah',
        name: 'Sarah Miller',
        age: 28,
        condition: 'Type 1 Diabetes',
        personality: 'tech-savvy, optimistic, proactive',
        responseStyle: 'casual',
        preferredProvider: 'gemini',
      },
      {
        id: 'robert',
        name: 'Robert Chen',
        age: 54,
        condition: 'Hypertension + Sleep Apnea',
        personality: 'analytical, detail-oriented, formal',
        responseStyle: 'detailed',
        preferredProvider: 'anthropic',
      },
      {
        id: 'emma',
        name: 'Emma Thompson',
        age: 34,
        condition: 'Long COVID',
        personality: 'empathetic, self-aware, frustrated',
        responseStyle: 'brief',
        preferredProvider: 'gemini',
      },
      {
        id: 'michael',
        name: 'Michael Anderson',
        age: 67,
        condition: 'Heart Arrhythmia',
        personality: 'polite, traditional, meticulous',
        responseStyle: 'brief',
        preferredProvider: 'local',
      },
    ];

    for (const config of configs) {
      this.patientConfigs.set(config.id, config);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

let agentService: AgentService | null = null;

export function initAgentService(config?: { mode?: AgentRuntimeMode }): AgentService {
  if (!agentService) {
    agentService = new AgentService(config);
  }
  return agentService;
}

export function getAgentService(): AgentService {
  if (!agentService) {
    throw new Error('Agent Service not initialized. Call initAgentService first.');
  }
  return agentService;
}
