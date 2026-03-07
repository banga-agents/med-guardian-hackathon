'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Shield, Brain, Play, Pause, RotateCcw, Zap,
  Lock, Database, Heart, Link2, Cpu, Clock, Activity, GitBranch, Briefcase,
} from 'lucide-react';

import { useSimulationStore } from '@/store/simulationStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { SimulationEngine } from '@/components/dashboard/SimulationEngine';
import { PatientRoster } from '@/components/dashboard/PatientRoster';
import { ClinicalWorkspace } from '@/components/dashboard/ClinicalWorkspace';
import { DoctorView } from '@/components/dashboard/DoctorView';
import { ClinicalConsoleTabs } from '@/components/dashboard/ClinicalConsoleTabs';
import { CostTelemetryPanel } from '@/components/dashboard/CostTelemetryPanel';
import { BlockchainDiagram } from '@/components/dashboard/BlockchainDiagram';
import { CreStatus } from '@/components/dashboard/CreStatus';
import { ProfessionalNetworkPanel } from '@/components/dashboard/ProfessionalNetworkPanel';
import { AkashaAgentPanel } from '@/components/dashboard/AkashaAgentPanel';
import { PatientMobileShell } from '@/components/dashboard/PatientMobileShell';
import { api } from '@/lib/api';
import { toPatientAgent } from '@/lib/patientProfiles';
import { PatientId } from '@/types/simulation';

type CenterView = 'clinical' | 'doctor' | 'cre' | 'network' | 'agent';

const ARC_TABS: { id: CenterView; label: string }[] = [
  { id: 'clinical', label: 'Journey' },
  { id: 'doctor',   label: 'Doctor'  },
  { id: 'agent',    label: 'Agent'   },
  { id: 'cre',      label: 'CRE'     },
  { id: 'network',  label: 'Network' },
];

export default function SimulationDashboard() {
  const [mounted, setMounted] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientId | null>(null);
  const [module, setModule] = useState<'arc' | 'cost'>('arc');
  const [centerView, setCenterView] = useState<CenterView>('clinical');
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [patientMobileMode, setPatientMobileMode] = useState(false);
  const [mobileModeTouched, setMobileModeTouched] = useState(false);

  const { simulation, demo, setSimulationRunning, setSimulationPaused, resetSimulation } =
    useSimulationStore();
  const upsertPatients = useSimulationStore((s) => s.upsertPatients);
  const patients = useSimulationStore((s) => s.patients);
  const explainMode = useSimulationStore((s) => s.explainMode);
  const setExplainMode = useSimulationStore((s) => s.setExplainMode);
  const { emit, connected } = useWebSocket();
  const isDedicatedFullTab =
    module === 'arc' && (centerView === 'network' || centerView === 'agent');
  const selectedProfile = selectedPatient ? patients[selectedPatient] : null;
  const showPatientMobileShell = isMobileViewport && patientMobileMode;

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(max-width: 1023px)');
    const apply = () => setIsMobileViewport(mediaQuery.matches);
    apply();
    mediaQuery.addEventListener('change', apply);
    return () => mediaQuery.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (!isMobileViewport) {
      setPatientMobileMode(false);
      return;
    }
    if (!mobileModeTouched) {
      setPatientMobileMode(true);
      if (!selectedPatient && patients.self) {
        setSelectedPatient('self');
      }
    }
  }, [isMobileViewport, mobileModeTouched, patients.self, selectedPatient]);

  useEffect(() => {
    let cancelled = false;

    api
      .listPatientProfiles()
      .then((response) => {
        if (cancelled) return;
        upsertPatients(response.data.profiles.map((profile) => toPatientAgent(profile)));
      })
      .catch(() => {
        // Keep seeded frontend profiles when backend profile sync is unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, [upsertPatients]);

  const handleStart = async () => {
    if (simulation.isPaused) {
      setSimulationPaused(false);
      emit('simulation:start', { speed: simulation.speed });
    } else {
      setSimulationRunning(true);
      emit('simulation:start', { speed: simulation.speed });
    }
    try { await api.startDemo(); } catch { /* backend may not expose demo route */ }
    emit('demo:start', {});
  };

  const handlePause = () => {
    setSimulationPaused(true);
    emit('simulation:stop');
    emit('demo:stop', {});
  };

  const handleReset = () => {
    resetSimulation();
    emit('simulation:stop');
    emit('demo:stop', {});
  };

  // ── Loading splash ──
  if (!mounted) {
    return (
      <div className="min-h-[100dvh] bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FAFC_55%,#F1F5F9_100%)] flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <div className="relative inline-block mb-6">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-medical via-cre to-chainlink flex items-center justify-center glow-medical">
              <Shield className="w-10 h-10 text-white" />
            </div>
            <div className="absolute -inset-4 rounded-3xl border border-medical/20 animate-pulse-ring" />
          </div>
          <h1 className="text-2xl font-bold text-gradient mb-2">MedGuardian</h1>
          <p className="text-slate-500 text-sm">Initializing secure environment…</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="medical-light min-h-[100dvh] overflow-x-hidden flex flex-col text-slate-900">

      {explainMode && (
        <div className="fixed top-16 left-3 right-3 z-50 bg-slate-900/90 text-slate-100 text-xs px-3 py-2 rounded-lg border border-slate-700 shadow-lg sm:top-14 sm:left-auto sm:right-4">
          Explain Mode · Privacy annotations and Tenderly callouts are visible.
        </div>
      )}

      {/* ─────────────── HEADER ─────────────── */}
      <header className="min-h-14 flex-none border-b border-slate-200 bg-white/90 backdrop-blur-xl flex flex-wrap items-center gap-2 px-3 py-2 z-50 min-w-0">

        {/* Brand */}
        <div className="flex items-center gap-2.5 min-w-0 w-full sm:w-auto">
          <div className="relative">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-medical via-cre to-chainlink flex items-center justify-center glow-medical">
              <Shield className="w-4 h-4 text-white" />
            </div>
            {simulation.isRunning && !simulation.isPaused && (
              <span className="absolute -top-0.5 -right-0.5 live-dot w-2 h-2" />
            )}
          </div>
          <div>
            <h1 className="text-sm font-bold text-gradient leading-tight">MedGuardian</h1>
            <p className="text-[9px] text-slate-500 leading-tight">Privacy-Preserving Health AI</p>
          </div>
          <div className="hidden 2xl:flex items-center gap-1 ml-1">
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#0E767D]/10 border border-[#0E767D]/20 text-[9px] text-[#0E767D]">
              <Lock className="w-2 h-2" /> TEE
            </span>
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[9px] text-slate-600">
              <Cpu className="w-2 h-2" /> CRE
            </span>
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-[9px] text-indigo-600">
              <Link2 className="w-2 h-2" /> Chainlink
            </span>
            <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] border ${
              connected
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-slate-100 border-slate-200 text-slate-400'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
              {connected ? 'Live' : 'Offline'}
            </span>
          </div>
        </div>

        {!showPatientMobileShell && <div className="hidden lg:block h-5 w-px bg-slate-200 flex-none" />}

        {/* Module switch */}
        {!showPatientMobileShell ? (
          <div className="module-switch flex-none">
            <button
              type="button"
              onClick={() => setModule('arc')}
              className={`module-pill ${module === 'arc' ? 'module-pill-active-arc' : ''}`}
            >
              Arc
            </button>
            <button
              type="button"
              onClick={() => setModule('cost')}
              className={`module-pill ${module === 'cost' ? 'module-pill-active-cost' : ''}`}
            >
              Cost
            </button>
          </div>
        ) : (
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700">
            Patient-only mobile mode
          </div>
        )}

        {/* Arc view tabs — inline in header */}
        {module === 'arc' && !showPatientMobileShell && (
          <div className="min-w-0 w-full overflow-x-auto scrollbar-thin lg:flex-1 lg:w-auto">
            <div className="inline-flex items-center gap-0.5 p-0.5 bg-slate-100 rounded-lg">
              {ARC_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setCenterView(t.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
                    centerView === t.id
                      ? 'bg-white shadow-sm text-slate-800'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {t.id === 'clinical' && <Heart className="w-3 h-3" />}
                  {t.id === 'doctor'   && <Activity className="w-3 h-3" />}
                  {t.id === 'agent'    && <Brain className="w-3 h-3" />}
                  {t.id === 'cre'      && <GitBranch className="w-3 h-3" />}
                  {t.id === 'network'  && <Briefcase className="w-3 h-3" />}
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {module === 'cost' && !showPatientMobileShell && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200">
            <Database className="w-3.5 h-3.5 text-amber-600" />
            <span className="text-xs font-semibold text-amber-700">Cost Telemetry</span>
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center gap-2 w-full flex-wrap justify-between sm:w-auto sm:justify-end sm:flex-nowrap sm:ml-auto flex-none shrink-0">
          {showPatientMobileShell ? (
            <div className="flex items-center gap-2 sm:ml-auto">
              <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-600">
                {selectedProfile ? `${selectedProfile.name} • ${selectedProfile.condition}` : 'Select a patient profile'}
              </div>
              <button
                type="button"
                onClick={() => {
                  setMobileModeTouched(true);
                  setPatientMobileMode(false);
                }}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600"
              >
                Full Workspace
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  onClick={handleStart}
                  disabled={simulation.isRunning && !simulation.isPaused}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 active:scale-95
                    bg-[#0E767D]/10 border border-[#0E767D]/25 text-[#0E767D] hover:bg-[#0E767D]/20"
                >
                  <Play className="w-3 h-3" /> Start
                </button>
                <button
                  onClick={handlePause}
                  disabled={!simulation.isRunning || simulation.isPaused}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 active:scale-95
                    bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100"
                >
                  <Pause className="w-3 h-3" /> Pause
                </button>
                <button
                  onClick={handleReset}
                  className="p-1.5 rounded-lg transition-all active:scale-95 bg-slate-100 border border-slate-200 text-slate-600 hover:bg-slate-200"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>

              <div className="h-5 w-px bg-slate-200 hidden lg:block" />

              <div className="flex items-center gap-1">
                <Zap className="w-3 h-3 text-amber-500" />
                <select
                  value={simulation.speed}
                  onChange={(e) => useSimulationStore.getState().setSimulationSpeed(Number(e.target.value))}
                  className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs text-slate-600 focus:outline-none focus:border-[#0E767D]"
                >
                  <option value={1}>1×</option>
                  <option value={2}>2×</option>
                  <option value={5}>5×</option>
                  <option value={10}>10×</option>
                </select>
              </div>

              <div className="h-5 w-px bg-slate-200 hidden xl:block" />

              <div className="hidden xl:flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1">
                  <Heart className="w-3 h-3 text-rose-500" />
                  <span className="font-mono text-[#0E767D] font-bold tabular-nums">
                    {simulation.totalVitalsProcessed.toLocaleString()}
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <Database className="w-3 h-3 text-indigo-500" />
                  <span className="font-mono text-indigo-600 font-bold tabular-nums">
                    {simulation.totalBlockchainEvents.toLocaleString()}
                  </span>
                </span>
                {demo.isRunning ? (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#0E767D]/10 border border-[#0E767D]/25 text-[#0E767D]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0E767D] animate-pulse" />
                    Day {demo.currentDay}/7
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span className="font-mono text-slate-600">Day {simulation.dayNumber}</span>
                  </span>
                )}
              </div>

              <div className="h-5 w-px bg-slate-200 hidden xl:block" />
            </>
          )}

          <button
            type="button"
            onClick={() => setExplainMode(!explainMode)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              explainMode
                ? 'border-[#0E767D]/30 text-[#0E767D] bg-[#0E767D]/10'
                : 'border-slate-200 text-slate-500 bg-white hover:bg-slate-50'
            }`}
          >
            Explain {explainMode ? 'ON' : 'OFF'}
          </button>
          {isMobileViewport && !showPatientMobileShell ? (
            <button
              type="button"
              onClick={() => {
                setMobileModeTouched(true);
                setPatientMobileMode(true);
                if (!selectedPatient && patients.self) {
                  setSelectedPatient('self');
                }
              }}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-sky-200 text-sky-700 bg-sky-50"
            >
              Patient Mode
            </button>
          ) : null}
        </div>
      </header>

      {/* ─────────────── MAIN CONTENT ─────────────── */}
      <main className="flex-1 min-h-0 overflow-visible px-2 py-2 lg:overflow-hidden">
        {showPatientMobileShell ? (
          <PatientMobileShell
            selectedPatient={selectedPatient}
            onSelectPatient={setSelectedPatient}
          />
        ) : (
        <div className="grid min-h-0 grid-cols-1 gap-2 lg:grid-cols-12">
          {/* ── Left: Patient Roster ── */}
          {!isDedicatedFullTab && (
            <div className="overflow-visible flex flex-col min-h-0 lg:col-span-2 lg:overflow-hidden">
              <PatientRoster
                selectedPatient={selectedPatient}
                onSelectPatient={setSelectedPatient}
              />
            </div>
          )}

          {/* ── Center: Main workspace ── */}
          <div className={`${isDedicatedFullTab ? 'lg:col-span-12' : 'lg:col-span-7'} overflow-visible flex flex-col min-h-0 lg:overflow-hidden`}>
            {module === 'arc' && centerView === 'clinical' && (
              <ClinicalWorkspace
                selectedPatient={selectedPatient}
                onSelectPatient={setSelectedPatient}
              />
            )}

            {module === 'arc' && centerView === 'doctor' && (
              <DoctorView selectedPatient={selectedPatient} onSelectPatient={setSelectedPatient} />
            )}

            {module === 'arc' && centerView === 'agent' && (
              <div className="panel overflow-hidden min-h-[28rem] lg:h-full lg:min-h-0">
                <AkashaAgentPanel selectedPatient={selectedPatient} onSelectPatient={setSelectedPatient} />
              </div>
            )}

            {module === 'arc' && centerView === 'cre' && (
              <div className="flex flex-col gap-2 overflow-hidden min-h-[34rem] lg:h-full lg:min-h-0">
                <div className="panel overflow-hidden min-h-[24rem] lg:flex-1 lg:min-h-0 flex flex-col">
                  <div className="flex-none pb-2 mb-2 border-b border-slate-200">
                    <p className="text-[10px] font-bold tracking-widest uppercase text-slate-500">CRE Pipeline</p>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5">Chainlink Compute Runtime</p>
                  </div>
                  <div className="flex-1 overflow-hidden min-h-0">
                    <BlockchainDiagram />
                  </div>
                </div>
                <div className="flex-none">
                  <CreStatus />
                </div>
              </div>
            )}

            {module === 'arc' && centerView === 'network' && (
              <ProfessionalNetworkPanel />
            )}

            {module === 'cost' && (
              <CostTelemetryPanel />
            )}
          </div>

          {/* ── Right: Intelligence Console ── */}
          {!isDedicatedFullTab && (
            <div className="overflow-visible flex flex-col min-h-0 lg:col-span-3 lg:overflow-hidden">
              <ClinicalConsoleTabs />
            </div>
          )}
        </div>
        )}
      </main>

      {/* Background simulation engine */}
      {!showPatientMobileShell && <SimulationEngine />}

      {/* ─────────────── FOOTER ─────────────── */}
      <div className={`hidden lg:flex flex-none h-8 bg-white/90 backdrop-blur border-t border-slate-200 items-center justify-between px-4 z-50 ${showPatientMobileShell ? 'lg:hidden' : ''}`}>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <Lock className="w-2.5 h-2.5 text-[#0E767D]" /> Confidential HTTP
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <Brain className="w-2.5 h-2.5 text-violet-600" /> AI-Powered Agents
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <Shield className="w-2.5 h-2.5 text-emerald-600" /> Privacy-First Architecture
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          <span>Powered by Chainlink CRE</span>
          <span className="text-slate-300">|</span>
          <span className="text-gradient font-semibold">MedGuardian v1.0</span>
        </div>
      </div>
    </div>
  );
}
