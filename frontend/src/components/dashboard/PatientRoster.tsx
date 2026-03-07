'use client';

import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { sortPatientIdsForDisplay, toPatientAgent } from '@/lib/patientProfiles';
import { useSimulationStore } from '@/store/simulationStore';
import { getStateIcon, getWearableIcon } from '@/lib/utils';
import { PatientId } from '@/types/simulation';

interface PatientRosterProps {
  onSelectPatient: (patientId: PatientId | null) => void;
  selectedPatient: PatientId | null;
}

type FormMode = 'create' | 'edit' | null;

type ProfileFormState = {
  name: string;
  age: string;
  condition: string;
  bio: string;
  medicalHistory: string;
  medications: string;
  allergies: string;
  primaryDoctor: 'dr_chen' | 'dr_rodriguez' | 'dr_patel' | 'dr_smith';
};

const PATIENT_HEX: Record<string, string> = {
  self: '#0F766E',
  sarah: '#3B82F6',
  robert: '#F97316',
  emma: '#A855F7',
  michael: '#22C55E',
};

const VITAL_MAX = { heartRate: 160, bloodGlucose: 250, oxygenSaturation: 100 };

const PHASE_LABEL: Record<string, string> = {
  baseline: 'Baseline',
  perturbation: 'Perturbation',
  onset: 'Onset',
  escalation: 'Escalation',
  recovery: 'Recovery',
};

const PHASE_TONE: Record<string, string> = {
  baseline: 'text-emerald-700 border-emerald-200 bg-emerald-50',
  perturbation: 'text-amber-700 border-amber-200 bg-amber-50',
  onset: 'text-orange-700 border-orange-200 bg-orange-50',
  escalation: 'text-rose-700 border-rose-200 bg-rose-50',
  recovery: 'text-cyan-700 border-cyan-200 bg-cyan-50',
};

function fallbackHex(patientId: string): string {
  let hash = 0;
  for (let index = 0; index < patientId.length; index += 1) {
    hash = patientId.charCodeAt(index) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash) % 360} 70% 46%)`;
}

function splitLines(value: string): string[] {
  return value
    .split(/\n|,/) 
    .map((item) => item.trim())
    .filter(Boolean);
}

function VitalBar({ value, max, color, warning }: { value: number; max: number; color: string; warning?: boolean }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: warning ? '#EF4444' : color }}
      />
    </div>
  );
}

function createEmptyForm(): ProfileFormState {
  return {
    name: '',
    age: '33',
    condition: '',
    bio: '',
    medicalHistory: '',
    medications: '',
    allergies: '',
    primaryDoctor: 'dr_smith',
  };
}

export function PatientRoster({ onSelectPatient, selectedPatient }: PatientRosterProps) {
  const patients = useSimulationStore((state) => state.patients);
  const patientTimelines = useSimulationStore((state) => state.patientTimelines);
  const vitals = useSimulationStore((state) => state.vitals);
  const alerts = useSimulationStore((state) => state.alerts);
  const upsertPatient = useSimulationStore((state) => state.upsertPatient);
  const removePatient = useSimulationStore((state) => state.removePatient);

  const [formMode, setFormMode] = useState<FormMode>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState<ProfileFormState>(createEmptyForm());

  const patientIds = useMemo(() => sortPatientIdsForDisplay(patients), [patients]);
  const selectedProfile = selectedPatient ? patients[selectedPatient] : null;
  const canEditSelected = Boolean(selectedProfile && selectedProfile.profileType !== 'simulation');
  const canDeleteSelected = selectedProfile?.profileType === 'custom';

  const getLatestVital = (patientId: PatientId) =>
    vitals.filter((v) => v.patientId === patientId).slice(-1)[0];

  const getAlertCount = (patientId: PatientId) =>
    alerts.filter((a) => a.patientId === patientId && !a.isRead).length;

  const openCreateForm = () => {
    setFormMode('create');
    setFormError('');
    setForm(createEmptyForm());
  };

  const openEditForm = () => {
    if (!selectedProfile || !canEditSelected) return;
    setFormMode('edit');
    setFormError('');
    setForm({
      name: selectedProfile.name,
      age: String(selectedProfile.age),
      condition: selectedProfile.condition,
      bio: selectedProfile.bio,
      medicalHistory: '',
      medications: '',
      allergies: '',
      primaryDoctor: 'dr_smith',
    });

    void api.listPatientProfiles().then((response) => {
      const profile = response.data.profiles.find((entry) => entry.id === selectedProfile.id);
      if (!profile) return;
      setForm({
        name: profile.name,
        age: String(profile.age),
        condition: profile.condition,
        bio: profile.bio || '',
        medicalHistory: profile.medicalHistory.join('\n'),
        medications: profile.medications.join('\n'),
        allergies: profile.allergies.join('\n'),
        primaryDoctor: profile.primaryDoctor,
      });
    }).catch(() => {
      // Keep optimistic values when profile fetch fails.
    });
  };

  const closeForm = () => {
    setFormMode(null);
    setFormError('');
    setForm(createEmptyForm());
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.condition.trim()) {
      setFormError('Name and condition are required.');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const payload = {
        name: form.name.trim(),
        age: Number.parseInt(form.age, 10) || 0,
        condition: form.condition.trim(),
        bio: form.bio.trim() || undefined,
        medicalHistory: splitLines(form.medicalHistory),
        medications: splitLines(form.medications),
        allergies: splitLines(form.allergies),
        primaryDoctor: form.primaryDoctor,
      };

      const response =
        formMode === 'edit' && selectedPatient
          ? await api.updatePatientProfile(selectedPatient, payload)
          : await api.createPatientProfile(payload);

      const patient = toPatientAgent(response.data);
      upsertPatient(patient);
      onSelectPatient(patient.id);
      closeForm();
    } catch (error: any) {
      setFormError(error.message || `Unable to ${formMode === 'edit' ? 'update' : 'create'} profile`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedPatient || !canDeleteSelected) return;
    if (typeof window !== 'undefined' && !window.confirm(`Delete ${selectedProfile?.name}? This cannot be undone.`)) {
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      await api.deletePatientProfile(selectedPatient);
      removePatient(selectedPatient);
      onSelectPatient('self');
      closeForm();
    } catch (error: any) {
      setFormError(error.message || 'Unable to delete profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="panel h-auto min-h-[20rem] lg:h-full flex flex-col">
      <div className="mb-3 pb-2 border-b border-slate-200">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-4 rounded-full bg-[#0EA5E9]" />
            <h2 className="text-xs font-bold tracking-wider uppercase text-slate-700">Patient Roster</h2>
          </div>
          <div className="flex items-center gap-2">
            {canEditSelected ? (
              <button
                type="button"
                onClick={openEditForm}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Edit
              </button>
            ) : null}
            <button
              type="button"
              onClick={formMode === 'create' ? closeForm : openCreateForm}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              {formMode === 'create' ? 'Close' : 'New Profile'}
            </button>
          </div>
        </div>

        {selectedProfile ? (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">{selectedProfile.name}</p>
                <p className="mt-1 text-[11px] text-slate-600">{selectedProfile.bio}</p>
              </div>
              {selectedProfile.profileType ? (
                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                  {selectedProfile.profileType}
                </span>
              ) : null}
            </div>
            {canDeleteSelected ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 disabled:opacity-50"
              >
                Delete Profile
              </button>
            ) : null}
          </div>
        ) : null}

        {formMode ? (
          <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {formMode === 'edit' ? 'Edit Profile' : 'Create Profile'}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Name"
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#0EA5E9]"
              />
              <input
                value={form.age}
                onChange={(event) => setForm((current) => ({ ...current, age: event.target.value }))}
                inputMode="numeric"
                placeholder="Age"
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#0EA5E9]"
              />
            </div>
            <input
              value={form.condition}
              onChange={(event) => setForm((current) => ({ ...current, condition: event.target.value }))}
              placeholder="Condition or reason for monitoring"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#0EA5E9]"
            />
            <textarea
              value={form.bio}
              onChange={(event) => setForm((current) => ({ ...current, bio: event.target.value }))}
              placeholder="Short profile summary"
              rows={2}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#0EA5E9]"
            />
            <select
              value={form.primaryDoctor}
              onChange={(event) => setForm((current) => ({ ...current, primaryDoctor: event.target.value as ProfileFormState['primaryDoctor'] }))}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#0EA5E9]"
            >
              <option value="dr_smith">Primary doctor: Dr. Smith</option>
              <option value="dr_chen">Primary doctor: Dr. Chen</option>
              <option value="dr_rodriguez">Primary doctor: Dr. Rodriguez</option>
              <option value="dr_patel">Primary doctor: Dr. Patel</option>
            </select>
            <textarea
              value={form.medicalHistory}
              onChange={(event) => setForm((current) => ({ ...current, medicalHistory: event.target.value }))}
              placeholder="Medical history, comma or line separated"
              rows={2}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#0EA5E9]"
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <textarea
                value={form.medications}
                onChange={(event) => setForm((current) => ({ ...current, medications: event.target.value }))}
                placeholder="Medications"
                rows={2}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#0EA5E9]"
              />
              <textarea
                value={form.allergies}
                onChange={(event) => setForm((current) => ({ ...current, allergies: event.target.value }))}
                placeholder="Allergies"
                rows={2}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#0EA5E9]"
              />
            </div>
            {formError ? <p className="text-xs text-rose-600">{formError}</p> : null}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving}
                className="rounded-lg bg-[#0EA5E9] px-3 py-2 text-sm font-semibold text-white transition disabled:opacity-50"
              >
                {saving ? (formMode === 'edit' ? 'Saving…' : 'Creating…') : formMode === 'edit' ? 'Save Changes' : 'Create Profile'}
              </button>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto scrollbar-thin">
        {patientIds.map((id) => {
          const patient = patients[id];
          const vital = getLatestVital(id);
          const isSelected = selectedPatient === id;
          const hex = PATIENT_HEX[id] ?? fallbackHex(id);
          const alertCount = getAlertCount(id);
          const hasAlert = alertCount > 0;
          const timeline = patientTimelines[id];
          const phaseTone = timeline ? PHASE_TONE[timeline.phase] : 'text-slate-500 border-slate-200 bg-slate-50';
          const phaseLabel = timeline ? PHASE_LABEL[timeline.phase] ?? timeline.phase : 'Timeline';

          return (
            <div
              key={id}
              onClick={() => onSelectPatient(isSelected ? null : id)}
              className="rounded-xl border cursor-pointer transition-all duration-300 overflow-hidden"
              style={isSelected ? {
                borderColor: `${hex}40`,
                background: `linear-gradient(135deg, ${hex}10 0%, transparent 70%)`,
                boxShadow: `0 0 16px ${hex}18, 0 4px 12px rgba(0,0,0,0.12)`,
              } : {
                borderColor: 'rgba(148, 163, 184, 0.25)',
                background: 'rgba(255, 255, 255, 0.85)',
              }}
            >
              <div className="flex items-center gap-3 px-3 pt-3 pb-1">
                <div className="relative flex-shrink-0">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-base font-bold"
                    style={{
                      background: `linear-gradient(135deg, ${hex}30, ${hex}15)`,
                      color: hex,
                      boxShadow: patient.isConnected ? `0 0 10px ${hex}40` : 'none',
                    }}
                  >
                    {patient.name.charAt(0)}
                  </div>
                  {patient.isConnected && (
                    <span
                      className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white bg-[#22C55E]"
                      style={{ boxShadow: '0 0 6px #22C55E' }}
                    />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-semibold text-slate-800 truncate">{patient.name}</h3>
                    {hasAlert && (
                      <span className="flex-shrink-0 text-[10px] font-bold text-[#EF4444] bg-[#EF4444]/15 border border-[#EF4444]/25 px-1.5 py-0.5 rounded-full animate-pulse">
                        {alertCount}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 capitalize truncate">
                    {getStateIcon(patient.state)} {patient.state}
                    {patient.currentActivity ? ` · ${patient.currentActivity}` : ''}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <span className={`inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full border ${phaseTone}`}>
                      <span>{phaseLabel}</span>
                      {timeline ? <span className="text-slate-500">Day {timeline.simulatedDay}</span> : null}
                    </span>
                    {patient.profileType && patient.profileType !== 'simulation' ? (
                      <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full border border-sky-200 bg-sky-50 text-sky-700">
                        {patient.profileType === 'personal' ? 'Personal' : 'Manual'}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              {vital ? (
                <div className="px-3 pb-2 space-y-1.5 mt-1">
                  {vital.heartRate !== undefined && (
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-[#EF4444]/70 w-6 flex-shrink-0">HR</span>
                      <VitalBar value={vital.heartRate} max={VITAL_MAX.heartRate} color="#EF4444" warning={vital.heartRate > 120} />
                      <span className="text-[9px] font-mono text-slate-500 w-12 text-right">
                        {vital.heartRate} bpm
                      </span>
                    </div>
                  )}
                  {vital.oxygenSaturation !== undefined && (
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-[#0EA5E9]/70 w-6 flex-shrink-0">O2</span>
                      <VitalBar value={vital.oxygenSaturation} max={VITAL_MAX.oxygenSaturation} color="#0EA5E9" warning={vital.oxygenSaturation < 94} />
                      <span className="text-[9px] font-mono text-slate-500 w-12 text-right">
                        {vital.oxygenSaturation}%
                      </span>
                    </div>
                  )}
                  {vital.bloodGlucose !== undefined && (
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-[#F59E0B]/70 w-6 flex-shrink-0">GL</span>
                      <VitalBar value={vital.bloodGlucose} max={VITAL_MAX.bloodGlucose} color="#F59E0B" warning={vital.bloodGlucose > 180} />
                      <span className="text-[9px] font-mono text-slate-500 w-12 text-right">
                        {vital.bloodGlucose} mg
                      </span>
                    </div>
                  )}
                  {vital.bloodPressure && (
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-[#6366F1]/70 w-6 flex-shrink-0">BP</span>
                      <span className="text-[10px] font-mono text-slate-500">
                        {vital.bloodPressure.systolic}/{vital.bloodPressure.diastolic} mmHg
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="px-3 pb-2 pt-1 text-[10px] text-slate-500">
                  {patient.wearables.length > 0 ? 'Waiting for recent vitals…' : 'Manual symptom journal only'}
                </div>
              )}

              <div className="px-3 pb-2 flex items-center gap-1">
                {patient.wearables.slice(0, 4).map((wearable) => (
                  <span key={wearable.id} className="text-xs opacity-60" title={wearable.name}>
                    {getWearableIcon(wearable.type)}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
