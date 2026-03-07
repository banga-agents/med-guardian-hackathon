'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Briefcase,
  CheckCircle2,
  DollarSign,
  FlaskConical,
  HeartPulse,
  Loader2,
  RefreshCw,
  SendHorizontal,
  ShieldCheck,
  UserRoundCheck,
} from 'lucide-react';

import { api } from '@/lib/api';
import { sortPatientIdsForDisplay } from '@/lib/patientProfiles';
import { useSimulationStore } from '@/store/simulationStore';
import type { NetworkTask, PatientId } from '@/types/simulation';

const ROLE_LABEL: Record<string, string> = {
  doctor: 'Doctors',
  nurse: 'Nurses',
  lab_tech: 'Lab Techs',
  caregiver: 'Caregivers',
  nutritionist: 'Nutritionists',
};

type NetworkPanelTab = 'overview' | 'operators' | 'queues' | 'activity';

function roleTitle(role: string) {
  return role.replace('_', ' ');
}

function extractError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Request failed';
}

function defaultSubmission(task: NetworkTask) {
  const role = roleTitle(task.role);
  return {
    notes: `${role} reviewed AI findings and confirmed triage recommendations align with recent vitals.`,
    confidence: 0.88,
    recommendation: 'Proceed with monitored care plan and follow-up check within 24 hours.',
    followUpActions: [
      'Confirm patient understanding of next steps',
      'Schedule symptom re-check in 24h',
      'Escalate immediately if severity worsens',
    ],
    evidenceRefs: [`task:${task.id}`, `case:${task.caseId}`],
  };
}

export function ProfessionalNetworkPanel() {
  const enabled = useSimulationStore((state) => state.networkEnabled);
  const marketplaceEnabled = useSimulationStore((state) => state.networkMarketplaceEnabled);
  const payoutsEnabled = useSimulationStore((state) => state.networkPayoutsEnabled);
  const patients = useSimulationStore((state) => state.patients);
  const professionals = useSimulationStore((state) => state.professionals);
  const networkCases = useSimulationStore((state) => state.networkCases);
  const networkTasks = useSimulationStore((state) => state.networkTasks);
  const payouts = useSimulationStore((state) => state.payouts);
  const setNetworkFlags = useSimulationStore((state) => state.setNetworkFlags);
  const setNetworkSnapshot = useSimulationStore((state) => state.setNetworkSnapshot);
  const upsertNetworkCase = useSimulationStore((state) => state.upsertNetworkCase);
  const upsertNetworkTask = useSimulationStore((state) => state.upsertNetworkTask);
  const upsertPayout = useSimulationStore((state) => state.upsertPayout);

  const [selectedProfessionalId, setSelectedProfessionalId] = useState('');
  const [approverId, setApproverId] = useState('dr_chen');
  const [intakePatientId, setIntakePatientId] = useState<PatientId>('self');
  const [intakeReason, setIntakeReason] = useState('Escalated symptom cluster requires human validation.');
  const [intakeSeverity, setIntakeSeverity] = useState(4);
  const [loading, setLoading] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<NetworkPanelTab>('overview');
  const patientOptions = useMemo(() => sortPatientIdsForDisplay(patients), [patients]);

  const professionalsById = useMemo(
    () => new Map(professionals.map((profile) => [profile.id, profile])),
    [professionals]
  );
  const selectedProfessional = selectedProfessionalId
    ? professionalsById.get(selectedProfessionalId)
    : null;

  const openTasks = networkTasks.filter((task) => task.status === 'open' || task.status === 'claimed').length;
  const validatedCases = networkCases.filter((record) => record.status === 'validated').length;
  const totalPaid = payouts.reduce((sum, item) => sum + item.amountUsd, 0);
  const claimedTasksCount = networkTasks.filter((task) => task.status === 'claimed').length;
  const submittedTasksCount = networkTasks.filter((task) => task.status === 'submitted').length;
  const paidTasksCount = networkTasks.filter((task) => task.status === 'paid').length;

  const demoFlow = useMemo(
    () => [
      {
        id: 'intake',
        label: 'Intake',
        done: networkCases.length > 0,
        hint: `${networkCases.length} cases`,
      },
      {
        id: 'claim',
        label: 'Claim',
        done: claimedTasksCount > 0 || submittedTasksCount > 0 || paidTasksCount > 0,
        hint: `${claimedTasksCount} claimed`,
      },
      {
        id: 'submit',
        label: 'Submit',
        done: submittedTasksCount > 0 || paidTasksCount > 0,
        hint: `${submittedTasksCount} submitted`,
      },
      {
        id: 'approve',
        label: 'Approve + Pay',
        done: paidTasksCount > 0,
        hint: `${paidTasksCount} paid`,
      },
    ],
    [networkCases.length, claimedTasksCount, submittedTasksCount, paidTasksCount]
  );

  const openQueue = useMemo(
    () => networkTasks.filter((task) => task.status === 'open').slice(0, 4),
    [networkTasks]
  );
  const myClaimed = useMemo(
    () =>
      networkTasks
        .filter((task) => task.status === 'claimed' && task.claimedBy === selectedProfessionalId)
        .slice(0, 4),
    [networkTasks, selectedProfessionalId]
  );
  const submittedQueue = useMemo(
    () => networkTasks.filter((task) => task.status === 'submitted').slice(0, 4),
    [networkTasks]
  );

  useEffect(() => {
    if (selectedProfessionalId) return;
    const firstOnline = professionals.find((profile) => profile.status !== 'offline') ?? professionals[0];
    if (firstOnline) setSelectedProfessionalId(firstOnline.id);
  }, [professionals, selectedProfessionalId]);

  const refreshSnapshot = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const status = await api.getNetworkStatus();
      setNetworkFlags({
        enabled: status.data.enabled,
        marketplaceEnabled: status.data.marketplaceEnabled,
        payoutsEnabled: status.data.payoutsEnabled,
      });
      if (status.data.enabled) {
        const snapshot = await api.getNetworkSnapshot(60);
        setNetworkSnapshot(snapshot.data);
      }
    } catch (error) {
      setErrorMessage(extractError(error));
    } finally {
      setLoading(false);
    }
  }, [setNetworkFlags, setNetworkSnapshot]);

  useEffect(() => {
    void refreshSnapshot();
  }, [refreshSnapshot]);

  const handleIntakeCase = async () => {
    if (!enabled || !marketplaceEnabled) return;
    if (!intakeReason.trim()) {
      setErrorMessage('Case reason is required');
      return;
    }
    setBusyTaskId('intake');
    setErrorMessage(null);
    setNotice(null);
    try {
      const response = await api.intakeNetworkCase({
        patientId: intakePatientId,
        source: 'manual',
        reason: intakeReason.trim(),
        severity: intakeSeverity,
      });
      upsertNetworkCase(response.data.caseRecord);
      response.data.tasks.forEach((task) => upsertNetworkTask(task));
      setNotice(
        response.data.deduped
          ? `Reused existing case for ${intakePatientId}.`
          : `Created case ${response.data.caseRecord.id}.`
      );
    } catch (error) {
      setErrorMessage(extractError(error));
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleClaim = async (taskId: string) => {
    if (!selectedProfessionalId) return;
    setBusyTaskId(taskId);
    setErrorMessage(null);
    setNotice(null);
    try {
      const response = await api.claimNetworkTask(taskId, selectedProfessionalId);
      upsertNetworkTask(response.data);
      setNotice(`Task ${taskId.slice(0, 10)} claimed by ${selectedProfessionalId}.`);
    } catch (error) {
      setErrorMessage(extractError(error));
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleSubmit = async (task: NetworkTask) => {
    if (!selectedProfessionalId) return;
    setBusyTaskId(task.id);
    setErrorMessage(null);
    setNotice(null);
    try {
      const response = await api.submitNetworkTask(task.id, {
        professionalId: selectedProfessionalId,
        submission: defaultSubmission(task),
      });
      upsertNetworkTask(response.data);
      setNotice(`Submitted ${task.id.slice(0, 10)} for approval.`);
    } catch (error) {
      setErrorMessage(extractError(error));
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleApprove = async (taskId: string) => {
    if (!approverId.trim()) {
      setErrorMessage('Approver ID is required');
      return;
    }
    setBusyTaskId(taskId);
    setErrorMessage(null);
    setNotice(null);
    try {
      const response = await api.approveNetworkTask(taskId, approverId.trim(), 'Validated in console');
      upsertNetworkTask(response.data.task);
      if (response.data.caseRecord) upsertNetworkCase(response.data.caseRecord);
      if (response.data.payout) upsertPayout(response.data.payout);
      setNotice(`Approved ${taskId.slice(0, 10)}${response.data.payout ? ' and issued payout.' : '.'}`);
    } catch (error) {
      setErrorMessage(extractError(error));
    } finally {
      setBusyTaskId(null);
    }
  };
  const onlineByRole = professionals.reduce<Record<string, number>>((acc, profile) => {
    if (profile.status !== 'offline') {
      acc[profile.role] = (acc[profile.role] || 0) + 1;
    }
    return acc;
  }, {});

  return (
    <div className="panel h-full flex flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-4 rounded-full bg-emerald-500" />
          <div>
            <p className="text-xs font-bold tracking-wider uppercase text-slate-700">Professional Network</p>
            <p className="text-[11px] text-slate-400">Collaborative case validation + rewards</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void refreshSnapshot()}
            className="p-1.5 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
            disabled={loading}
            title="Refresh network snapshot"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </button>
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
        </div>
      </div>

      <div className="mt-3 flex-1 overflow-y-auto pr-1 scrollbar-thin min-h-0">
      {!enabled ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
          Disabled. Enable `ENABLE_PRO_NETWORK=true` in backend env.
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 sm:grid-cols-4">
            {([
              { key: 'overview', label: 'Overview' },
              { key: 'operators', label: 'Operators' },
              { key: 'queues', label: 'Queues' },
              { key: 'activity', label: 'Activity' },
            ] as Array<{ key: NetworkPanelTab; label: string }>).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setPanelTab(tab.key)}
                className={`w-full rounded-md px-2 py-1 text-[11px] font-semibold transition ${
                  panelTab === tab.key
                    ? 'bg-white border border-slate-200 text-slate-800'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {(notice || errorMessage) && (
            <div
              className={`mt-3 rounded-lg border px-3 py-2 text-[11px] ${
                errorMessage
                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              }`}
            >
              {errorMessage || notice}
            </div>
          )}

          {panelTab === 'overview' && (
            <>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                <div className="metric-tile">
                  <p className="text-slate-500 uppercase text-[10px]">Open Tasks</p>
                  <p className="text-lg font-semibold text-slate-800 flex items-center gap-1.5 mt-1">
                    <Briefcase className="w-4 h-4 text-sky-600" />
                    {openTasks}
                  </p>
                </div>
                <div className="metric-tile">
                  <p className="text-slate-500 uppercase text-[10px]">Validated Cases</p>
                  <p className="text-lg font-semibold text-slate-800 flex items-center gap-1.5 mt-1">
                    <HeartPulse className="w-4 h-4 text-rose-600" />
                    {validatedCases}
                  </p>
                </div>
                <div className="metric-tile">
                  <p className="text-slate-500 uppercase text-[10px]">Professionals Online</p>
                  <p className="text-lg font-semibold text-slate-800 flex items-center gap-1.5 mt-1">
                    <UserRoundCheck className="w-4 h-4 text-emerald-600" />
                    {professionals.filter((p) => p.status !== 'offline').length}
                  </p>
                </div>
                <div className="metric-tile">
                  <p className="text-slate-500 uppercase text-[10px]">Paid Rewards</p>
                  <p className="text-lg font-semibold text-slate-800 flex items-center gap-1.5 mt-1">
                    <DollarSign className="w-4 h-4 text-indigo-600" />
                    ${totalPaid.toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600 flex flex-wrap gap-x-3 gap-y-1">
                <span>Marketplace: <strong className={marketplaceEnabled ? 'text-emerald-700' : 'text-amber-700'}>{marketplaceEnabled ? 'ON' : 'OFF'}</strong></span>
                <span>Payouts: <strong className={payoutsEnabled ? 'text-emerald-700' : 'text-amber-700'}>{payoutsEnabled ? 'ON' : 'OFF'}</strong></span>
              </div>

              <div className="mt-3 rounded-lg border border-slate-200 p-2.5">
                <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1.5">Judge Demo Flow</p>
                <div className="grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-4">
                  {demoFlow.map((step, idx) => (
                    <div
                      key={step.id}
                      className={`rounded-md border px-2 py-1.5 ${
                        step.done ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <p className={`font-semibold ${step.done ? 'text-emerald-700' : 'text-slate-600'}`}>
                        {idx + 1}. {step.label}
                      </p>
                      <p className={`${step.done ? 'text-emerald-600' : 'text-slate-400'} mt-0.5`}>{step.hint}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-slate-200 p-2.5">
                <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1.5">Role Capacity</p>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  {(Object.keys(ROLE_LABEL) as Array<keyof typeof ROLE_LABEL>).map((role) => (
                    <div key={role} className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-2 py-1.5">
                      <span className="text-slate-600">{ROLE_LABEL[role]}</span>
                      <span className="font-semibold text-slate-800">{onlineByRole[role] || 0}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {panelTab === 'operators' && (
            <>
              <div className="mt-3 rounded-lg border border-slate-200 p-2.5 space-y-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Operator Controls</p>
                <div className="grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-slate-500">Working Professional</span>
                    <select
                      value={selectedProfessionalId}
                      onChange={(event) => setSelectedProfessionalId(event.target.value)}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-slate-700"
                    >
                      {professionals.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.name} ({roleTitle(profile.role)}) · {profile.status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-slate-500">Approver ID</span>
                    <input
                      value={approverId}
                      onChange={(event) => setApproverId(event.target.value)}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-slate-700"
                      placeholder="dr_chen"
                    />
                  </label>
                </div>
                <p className="text-[10px] text-slate-500">
                  Active operator:{' '}
                  <span className="font-semibold text-slate-700">
                    {selectedProfessional ? `${selectedProfessional.name} (${roleTitle(selectedProfessional.role)})` : 'none'}
                  </span>
                </p>
              </div>

              <div className="mt-3 rounded-lg border border-slate-200 p-2.5 space-y-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Manual Case Intake</p>
                <div className="grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-slate-500">Patient</span>
                    <select
                      value={intakePatientId}
                      onChange={(event) => setIntakePatientId(event.target.value as PatientId)}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-slate-700"
                    >
                        {patientOptions.map((patientId) => (
                          <option key={patientId} value={patientId}>
                            {patients[patientId]?.name ?? patientId}
                          </option>
                        ))}
                      </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-slate-500">Severity</span>
                    <select
                      value={intakeSeverity}
                      onChange={(event) => setIntakeSeverity(Number(event.target.value))}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-slate-700"
                    >
                      {[1, 2, 3, 4, 5].map((level) => (
                        <option key={level} value={level}>{level}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 sm:col-span-1">
                    <span className="text-slate-500">Reason</span>
                    <input
                      value={intakeReason}
                      onChange={(event) => setIntakeReason(event.target.value)}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-slate-700"
                      placeholder="AI escalated case reason"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  disabled={!marketplaceEnabled || busyTaskId === 'intake'}
                  onClick={() => void handleIntakeCase()}
                  className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 disabled:opacity-50"
                >
                  {busyTaskId === 'intake' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  Create Case
                </button>
              </div>
            </>
          )}

          {panelTab === 'queues' && (
            <>
              <div className="mt-3 rounded-lg border border-slate-200 p-2.5">
                <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1.5 flex items-center gap-1">
                  <Briefcase className="w-3.5 h-3.5 text-sky-600" />
                  Open Queue
                </p>
                <div className="space-y-1.5">
                  {openQueue.map((task) => {
                    const canClaim = Boolean(selectedProfessional)
                      && selectedProfessional?.role === task.role
                      && selectedProfessional.status !== 'offline';
                    return (
                      <div key={task.id} className="rounded-md border border-slate-200 bg-white px-2 py-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] text-slate-700 line-clamp-1">{task.title}</p>
                          <button
                            type="button"
                            disabled={!canClaim || busyTaskId === task.id}
                            onClick={() => void handleClaim(task.id)}
                            className="rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700 disabled:opacity-40"
                          >
                            {busyTaskId === task.id ? '...' : 'Claim'}
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {roleTitle(task.role)} · {task.priority}
                        </p>
                      </div>
                    );
                  })}
                  {openQueue.length === 0 && (
                    <p className="text-[11px] text-slate-400">No open tasks.</p>
                  )}
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-slate-200 p-2.5">
                <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1.5 flex items-center gap-1">
                  <SendHorizontal className="w-3.5 h-3.5 text-violet-600" />
                  My Claimed Tasks
                </p>
                <div className="space-y-1.5">
                  {myClaimed.map((task) => (
                    <div key={task.id} className="rounded-md border border-slate-200 bg-white px-2 py-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] text-slate-700 line-clamp-1">{task.title}</p>
                        <button
                          type="button"
                          disabled={busyTaskId === task.id}
                          onClick={() => void handleSubmit(task)}
                          className="rounded border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 disabled:opacity-40"
                        >
                          {busyTaskId === task.id ? '...' : 'Submit'}
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">{roleTitle(task.role)} · claimed</p>
                    </div>
                  ))}
                  {myClaimed.length === 0 && (
                    <p className="text-[11px] text-slate-400">No claimed tasks for this professional.</p>
                  )}
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-slate-200 p-2.5">
                <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1.5 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Submitted For Approval
                </p>
                <div className="space-y-1.5">
                  {submittedQueue.map((task) => (
                    <div key={task.id} className="rounded-md border border-slate-200 bg-white px-2 py-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] text-slate-700 line-clamp-1">{task.title}</p>
                        <button
                          type="button"
                          disabled={busyTaskId === task.id}
                          onClick={() => void handleApprove(task.id)}
                          className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 disabled:opacity-40"
                        >
                          {busyTaskId === task.id ? '...' : 'Approve'}
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {roleTitle(task.role)} · submitted
                        {task.claimedBy ? ` · by ${task.claimedBy}` : ''}
                      </p>
                    </div>
                  ))}
                  {submittedQueue.length === 0 && (
                    <p className="text-[11px] text-slate-400">No submissions waiting for approval.</p>
                  )}
                </div>
              </div>
            </>
          )}

          {panelTab === 'activity' && (
            <>
              <div className="mt-3 rounded-lg border border-slate-200 p-2.5">
                <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1.5 flex items-center gap-1">
                  <FlaskConical className="w-3.5 h-3.5 text-indigo-600" />
                  Recent Case Tasks
                </p>
                <div className="space-y-1.5">
                  {networkTasks.slice(0, 6).map((task) => (
                    <div key={task.id} className="rounded-md border border-slate-200 bg-white px-2 py-1.5">
                      <p className="text-[11px] text-slate-700 line-clamp-1">{task.title}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {task.role.replace('_', ' ')} · {task.status}
                        {task.claimedBy ? ` · ${task.claimedBy}` : ''}
                      </p>
                    </div>
                  ))}
                  {networkTasks.length === 0 && (
                    <p className="text-[11px] text-slate-400">No collaborative tasks yet.</p>
                  )}
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-slate-200 p-2.5">
                <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1.5">Recent Payouts</p>
                <div className="space-y-1.5">
                  {payouts.slice(0, 5).map((payout) => (
                    <div key={payout.id} className="rounded-md border border-slate-200 bg-white px-2 py-1.5">
                      <p className="text-[11px] text-slate-700">{payout.professionalId}</p>
                      <p className="text-[10px] text-slate-500">
                        ${payout.amountUsd.toFixed(2)} · {roleTitle(payout.role)} · {new Date(payout.issuedAt).toLocaleTimeString()}
                      </p>
                    </div>
                  ))}
                  {payouts.length === 0 && (
                    <p className="text-[11px] text-slate-400">No payouts yet.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
      </div>
    </div>
  );
}
