/**
 * MedGuardian Backend Server
 * Real-time patient simulation, doctor portal, and AI agent integration
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';

import { initLLMService } from './services/agent/LLMService';
import { initAgentService } from './services/agent/AgentService';
import { setupAgentRoutes } from './routes/agent';
import { setupSimulationRoutes } from './routes/simulation';
import { setupDoctorRoutes } from './routes/doctor';
import { setupCRERoutes } from './routes/cre';
import { setupCostRoutes } from './routes/cost';
import { setupPatientRoutes } from './routes/patients';
import { setupPatientProfileRoutes } from './routes/patient-profiles';
import { setupNetworkRoutes } from './routes/network';
import { setupPatientAgentRoutes } from './routes/patient-agent';
import { setupDoctorAgentRoutes } from './routes/doctor-agent';
import { setupAkashaAlertRoutes } from './routes/alerts-akasha';
import { setupAkashaAuditRoutes } from './routes/audit-akasha';
import demoRoutes from './routes/demo';
import { setupWebSocketHandlers, setupDemoWebSocketHandlers } from './services/websocket';
import { startDoctorSimulator } from './services/simulation/DoctorSimulator';
import { startRequestCreatedWatcher } from './services/blockchain/RequestCreatedWatcher';
import { getProfessionalNetworkService } from './services/network/ProfessionalNetworkService';
import type { LLMProviderType } from './services/agent/types';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const normalizeOrigin = (value: string): string => value.trim().replace(/\/+$/, '');

const explicitOrigins = new Set(
  [
    process.env.FRONTEND_URL,
    process.env.FRONTEND_ORIGIN,
    ...(process.env.FRONTEND_URLS || '').split(','),
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => normalizeOrigin(value))
);

const isPrivateIPv4 = (hostname: string) => {
  const match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return false;
  const a = Number(match[1]);
  const b = Number(match[2]);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  // Includes Tailscale CGNAT range 100.64.0.0/10.
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
};

const allowDevOrigins = process.env.ALLOW_DEV_ORIGINS !== 'false';

const isAllowedOrigin = (origin?: string): boolean => {
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  if (explicitOrigins.has(normalized)) return true;

  if (process.env.NODE_ENV === 'production' || !allowDevOrigins) return false;

  try {
    const parsed = new URL(normalized);
    const isDemoPort = parsed.port === '3000';
    const host = parsed.hostname.toLowerCase();
    const isLocalHost = host === 'localhost' || host === '127.0.0.1';
    const isTailscaleHost = host.endsWith('.ts.net');
    const isPrivateHost = isPrivateIPv4(host);
    return isDemoPort && (isLocalHost || isPrivateHost || isTailscaleHost);
  } catch {
    return false;
  }
};

const resolveCorsOrigin = (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
) => {
  if (isAllowedOrigin(origin)) {
    callback(null, true);
    return;
  }
  console.warn(`⚠️ CORS blocked origin: ${origin ?? 'unknown'}`);
  callback(new Error('Not allowed by CORS'));
};

const io = new Server(httpServer, {
  cors: {
    origin: resolveCorsOrigin,
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 4000;
const providerNames: LLMProviderType[] = ['openai', 'anthropic', 'gemini', 'local'];
const parseFallbackOrder = (raw?: string): LLMProviderType[] | undefined => {
  if (!raw) return undefined;
  const values = raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is LLMProviderType => providerNames.includes(item as LLMProviderType));
  return values.length ? values : undefined;
};

// ============================================
// MIDDLEWARE
// ============================================

app.use(helmet());
app.use(cors({
  origin: resolveCorsOrigin,
}));
app.use(express.json({ limit: '10mb' }));

// ============================================
// INITIALIZE SERVICES
// ============================================

// Initialize LLM Service with multiple providers
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

// Initialize Agent Service
const agentService = initAgentService({
  mode: process.env.AGENT_MODE === 'akasha' ? 'akasha' : 'legacy',
});

console.log('✅ LLM Service initialized');
console.log('   Providers:', llmService.getAvailableProviders().join(', '));
console.log('   Default provider:', llmService.getDefaultProvider());
console.log('   Fallback order:', llmService.getFallbackOrder().join(' -> '));
console.log('✅ Agent Runtime initialized');
console.log('   Mode:', agentService.getAgentMode());
if (agentService.getAgentMode() === 'akasha') {
  console.log('   Kernel:', agentService.getKernelStatus());
}

// ============================================
// ROUTES
// ============================================

// Health check
app.get('/health', (req, res) => {
  const network = getProfessionalNetworkService().getStatus();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    services: {
      llm: llmService.getAvailableProviders(),
      simulation: 'ready',
      doctors: 'ready',
      network,
    },
  });
});

// API Routes
app.use('/api/agents', setupAgentRoutes());
app.use('/api/simulation', setupSimulationRoutes());
app.use('/api/doctors', setupDoctorRoutes());
app.use('/api/patients', setupPatientRoutes());
app.use('/api/patient-profiles', setupPatientProfileRoutes());
app.use('/api/cre', setupCRERoutes());
app.use('/api/cost', setupCostRoutes());
app.use('/api/network', setupNetworkRoutes());
app.use('/api/demo', demoRoutes);
app.use('/api/patient', setupPatientAgentRoutes());
app.use('/api/doctor', setupDoctorAgentRoutes());
app.use('/api/alerts', setupAkashaAlertRoutes());
app.use('/api/audit', setupAkashaAuditRoutes());
app.use('/api/medguardian', setupPatientAgentRoutes());
app.use('/api/medguardian/doctor', setupDoctorAgentRoutes());
app.use('/api/medguardian/alerts', setupAkashaAlertRoutes());
app.use('/api/medguardian/audit', setupAkashaAuditRoutes());

// ============================================
// WEBSOCKET
// ============================================

setupWebSocketHandlers(io);
setupDemoWebSocketHandlers(io);
startDoctorSimulator();
startRequestCreatedWatcher();

// ============================================
// ERROR HANDLING
// ============================================

app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// ============================================
// START SERVER
// ============================================

httpServer.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   🏥 MedGuardian Backend Server                          ║
║                                                          ║
║   Status: Running                                        ║
║   Port: ${PORT}                                          ║
║   Environment: ${process.env.NODE_ENV || 'development'}  ║
║                                                          ║
║   Services:                                              ║
║   • Multi-LLM AI Agents (Gemini, OpenAI, Anthropic, Local)║
║   • Real-time Patient Simulation                        ║
║   • Doctor Portal with Access Control                   ║
║   • WebSocket Events                                    ║
║   • Blockchain Integration Ready                        ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
  `);
});

export { io };
