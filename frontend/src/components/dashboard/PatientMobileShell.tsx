'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, MessageSquareHeart, UserRound } from 'lucide-react';
import { PatientRoster } from '@/components/dashboard/PatientRoster';
import { AkashaAgentPanel } from '@/components/dashboard/AkashaAgentPanel';
import { PatientAssistantPlanner } from '@/components/dashboard/PatientAssistantPlanner';
import { PatientReminderCenter } from '@/components/dashboard/PatientReminderCenter';
import { useSimulationStore } from '@/store/simulationStore';
import type { PatientId } from '@/types/simulation';

type PatientMobileTab = 'assistant' | 'care' | 'profile';
type ShellIcon = typeof CalendarDays;

export function PatientMobileShell({
  selectedPatient,
  onSelectPatient,
}: {
  selectedPatient: PatientId | null;
  onSelectPatient: (patientId: PatientId | null) => void;
}) {
  const [tab, setTab] = useState<PatientMobileTab>('assistant');
  const patients = useSimulationStore((state) => state.patients);

  const activePatient = useMemo(() => {
    if (selectedPatient && patients[selectedPatient]) {
      return patients[selectedPatient];
    }
    return patients.self ?? null;
  }, [patients, selectedPatient]);

  useEffect(() => {
    if (!selectedPatient && patients.self) {
      onSelectPatient('self');
    }
  }, [onSelectPatient, patients.self, selectedPatient]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 pb-16">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Patient Mode</p>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{activePatient?.name ?? 'Patient assistant'}</h2>
            <p className="mt-1 text-sm text-slate-600">
              {activePatient?.bio ?? 'Phone-first symptom journaling and follow-up support.'}
            </p>
          </div>
          {activePatient?.profileType ? (
            <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
              {activePatient.profileType}
            </span>
          ) : null}
        </div>
      </div>

      <PatientReminderCenter patientId={selectedPatient} />

      {tab === 'assistant' ? (
        <div className="panel min-h-[28rem] overflow-hidden">
          <AkashaAgentPanel selectedPatient={selectedPatient} onSelectPatient={onSelectPatient} mode="patient" />
        </div>
      ) : null}

      {tab === 'care' ? <PatientAssistantPlanner patientId={selectedPatient} /> : null}

      {tab === 'profile' ? (
        <div className="min-h-[22rem]">
          <PatientRoster selectedPatient={selectedPatient} onSelectPatient={onSelectPatient} />
        </div>
      ) : null}

      <div className="fixed inset-x-3 bottom-3 z-40 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-xl backdrop-blur">
        <div className="grid grid-cols-3 gap-2">
          {([
            { key: 'assistant', label: 'Assistant', icon: MessageSquareHeart },
            { key: 'care', label: 'Care', icon: CalendarDays },
            { key: 'profile', label: 'Profile', icon: UserRound },
          ] as Array<{ key: PatientMobileTab; label: string; icon: ShellIcon }>).map((item) => {
            const Icon = item.icon;
            const active = tab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={`flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-[11px] font-semibold transition ${
                  active
                    ? 'bg-[#0EA5E9] text-white shadow-sm'
                    : 'bg-slate-50 text-slate-600'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
