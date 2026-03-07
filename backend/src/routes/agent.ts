/**
 * Agent API Routes
 * Endpoints for patient agent interactions and LLM queries
 */

import { Router } from 'express';
import { getAgentService } from '../services/agent/AgentService';
import { getMedicalResearchService } from '../services/akasha/MedicalResearchService';
import { getAkashaTimescaleStore } from '../services/persistence/AkashaTimescaleStore';
import { z } from 'zod';
import type { ApiEnvelope } from '../types/simulation';
import type { LLMProviderType } from '../services/agent/types';
import { PatientIdSchema } from '../lib/patientIds';

const router = Router();
const ProviderEnum = z.enum(['openai', 'anthropic', 'gemini', 'local']);
const TimelineQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(40),
});

// ============================================
// VALIDATION SCHEMAS
// ============================================

const QuerySchema = z.object({
  patientId: PatientIdSchema,
  query: z.string().min(1).max(500),
  context: z.object({
    recentVitals: z.any().optional(),
    recentSymptoms: z.any().optional(),
    contextualFactors: z.any().optional(),
  }).optional(),
  provider: ProviderEnum.optional(),
});

const SupportQuerySchema = QuerySchema.extend({
  audience: z.enum(['patient', 'clinician']).default('clinician'),
});

const ReportSchema = z.object({
  patientId: PatientIdSchema,
  healthData: z.object({
    vitals: z.array(z.any()),
    symptoms: z.array(z.any()),
    medications: z.array(z.any()).optional(),
    period: z.object({
      start: z.number(),
      end: z.number(),
    }),
  }),
  provider: ProviderEnum.optional(),
});

// ============================================
// ROUTES
// ============================================

/**
 * POST /api/agents/query
 * Query a patient agent
 */
router.post('/query', async (req, res) => {
  try {
    const { patientId, query, context, provider } = QuerySchema.parse(req.body);
    
    const agentService = getAgentService();
    const result = await agentService.queryPatient(
      patientId,
      query,
      context,
      provider
    );
    
    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

router.post('/support-query', async (req, res) => {
  try {
    const { patientId, query, context, provider, audience } = SupportQuerySchema.parse(req.body);

    const agentService = getAgentService();
    const result = await agentService.querySupport(
      patientId,
      query,
      context,
      provider,
      audience
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/agents/report
 * Generate AI health report
 */
router.post('/report', async (req, res) => {
  try {
    const { patientId, healthData, provider } = ReportSchema.parse(req.body);
    
    const agentService = getAgentService();
    const result = await agentService.generateHealthReport({
      patientId,
      healthData,
      preferredProvider: provider,
    });
    
    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/agents/providers
 * Get available LLM providers
 */
router.get('/providers', async (req, res) => {
  try {
    const agentService = getAgentService();
    const providers = agentService.getAvailableProviders();
    const availability = await agentService.checkProviderAvailability();
    const defaultProvider = agentService.getDefaultProvider();
    const fallbackOrder = agentService.getFallbackOrder();
    const modelMap = agentService.getModelMap();
    const providerStatus = await agentService.getProviderCatalog();
    const healthyProviders = Object.entries(availability)
      .filter(([, isHealthy]) => Boolean(isHealthy))
      .map(([provider]) => provider as LLMProviderType);
    const llmHealthy = healthyProviders.length > 0;

    const researchService = getMedicalResearchService();
    const researchStatus = researchService.getStatus();

    const persistenceStore = getAkashaTimescaleStore();
    if (persistenceStore.isEnabled()) {
      try {
        await persistenceStore.init();
      } catch {
        // Status payload will expose lastError.
      }
    }
    const persistenceStatus = persistenceStore.getStatus();
    
    const response: ApiEnvelope<{
      providers: LLMProviderType[];
      availability: Record<string, boolean>;
      defaultProvider: LLMProviderType;
      fallbackOrder: LLMProviderType[];
      models: { chat: Record<LLMProviderType, string>; report: Record<LLMProviderType, string> };
      providerStatus: ReturnType<typeof agentService.getProviderCatalog> extends Promise<infer T> ? T : never;
      agentMode: ReturnType<typeof agentService.getAgentMode>;
      kernel: ReturnType<typeof agentService.getKernelStatus>;
      systemHealth: {
        llm: {
          healthy: boolean;
          defaultProvider: LLMProviderType;
          healthyProviders: LLMProviderType[];
          providerCount: number;
        };
        research: {
          healthy: boolean;
          enabled: boolean;
          provider: 'pubmed';
          apiKeyConfigured: boolean;
          mode: 'live' | 'disabled';
        };
        persistence: {
          healthy: boolean;
          configured: boolean;
          enabled: boolean;
          schemaReady: boolean;
          encryptionConfigured: boolean;
          backend: 'timescale' | 'in_memory';
          lastError?: string;
        };
      };
    }> = {
      success: true,
      data: {
        providers,
        availability,
        defaultProvider,
        fallbackOrder,
        models: modelMap,
        providerStatus,
        agentMode: agentService.getAgentMode(),
        kernel: agentService.getKernelStatus(),
        systemHealth: {
          llm: {
            healthy: llmHealthy,
            defaultProvider,
            healthyProviders,
            providerCount: healthyProviders.length,
          },
          research: {
            healthy: researchStatus.enabled,
            enabled: researchStatus.enabled,
            provider: researchStatus.provider,
            apiKeyConfigured: researchStatus.apiKeyConfigured,
            mode: researchStatus.mode,
          },
          persistence: {
            healthy:
              persistenceStatus.backend === 'in_memory'
                ? true
                : Boolean(persistenceStatus.enabled && persistenceStatus.schemaReady && !persistenceStatus.lastError),
            configured: persistenceStatus.configured,
            enabled: persistenceStatus.enabled,
            schemaReady: persistenceStatus.schemaReady,
            encryptionConfigured: persistenceStatus.encryptionConfigured,
            backend: persistenceStatus.backend,
            ...(persistenceStatus.lastError ? { lastError: persistenceStatus.lastError } : {}),
          },
        },
      },
    };

    res.json(response);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/agents/kernel/status
 * Get runtime status for Akasha kernel integration
 */
router.get('/kernel/status', async (_req, res) => {
  try {
    const agentService = getAgentService();
    res.json({
      success: true,
      data: agentService.getKernelStatus(),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/agents/:patientId/kernel/timeline?limit=40
 * Get in-memory case timeline (memory + audit) for a patient
 */
router.get('/:patientId/kernel/timeline', async (req, res) => {
  try {
    const { patientId } = z.object({
      patientId: PatientIdSchema,
    }).parse(req.params);
    const { limit } = TimelineQuerySchema.parse(req.query);
    const agentService = getAgentService();
    res.json({
      success: true,
      data: agentService.getCaseTimeline(patientId, limit),
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/agents/providers/default
 * Set default LLM provider
 */
router.post('/providers/default', async (req, res) => {
  try {
    const { provider } = z.object({
      provider: ProviderEnum,
    }).parse(req.body);
    
    const agentService = getAgentService();
    agentService.setDefaultProvider(provider);
    
    res.json({
      success: true,
      message: `Default provider set to ${provider}`,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/agents/:patientId/queries
 * Get query history for a patient
 */
router.get('/:patientId/queries', async (req, res) => {
  try {
    const { patientId } = req.params;
    const agentService = getAgentService();
    const queries = agentService.getPatientQueries(patientId);
    
    res.json({
      success: true,
      data: queries,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export function setupAgentRoutes(): Router {
  return router;
}
