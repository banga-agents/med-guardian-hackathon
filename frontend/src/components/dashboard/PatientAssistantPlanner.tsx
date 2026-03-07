'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { CalendarDays, CheckCircle2, Clock3, Pill, Salad, Stethoscope, Trash2 } from 'lucide-react';
import {
  api,
  type PatientAssistantItemKind,
  type PatientAssistantItemRecord,
  type PatientAssistantSnapshotRecord,
} from '@/lib/api';
import type { PatientId } from '@/types/simulation';

function formatDateTime(value?: number): string {
  if (!value) return 'No due time';
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function toDateTimeInput(value?: number): string {
  if (!value) return '';
  const date = new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function fromDateTimeInput(value: string): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function iconForKind(kind: PatientAssistantItemKind) {
  if (kind === 'medication') return <Pill className="h-3.5 w-3.5" />;
  if (kind === 'nutrition') return <Salad className="h-3.5 w-3.5" />;
  if (kind === 'appointment') return <Stethoscope className="h-3.5 w-3.5" />;
  return <Clock3 className="h-3.5 w-3.5" />;
}

function kindTone(kind: PatientAssistantItemKind): string {
  if (kind === 'medication') return 'border-indigo-200 bg-indigo-50 text-indigo-700';
  if (kind === 'nutrition') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (kind === 'appointment') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function statusTone(item: PatientAssistantItemRecord): string {
  if (item.status === 'completed') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (item.status === 'dismissed') return 'border-slate-200 bg-slate-100 text-slate-500';
  if (item.dueAt && item.dueAt < Date.now()) return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-slate-200 bg-white text-slate-700';
}

export function PatientAssistantPlanner({ patientId }: { patientId?: PatientId | null }) {
  const [snapshot, setSnapshot] = useState<PatientAssistantSnapshotRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [form, setForm] = useState({
    kind: 'task' as PatientAssistantItemKind,
    title: '',
    details: '',
    dueAt: '',
  });

  const loadSnapshot = async (targetPatientId: PatientId) => {
    setLoading(true);
    setError('');
    try {
      const response = await api.getPatientAssistantSnapshot(targetPatientId);
      setSnapshot(response.data);
    } catch (err: any) {
      setSnapshot(null);
      setError(err.message || 'Unable to load care planner');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!patientId) {
      setSnapshot(null);
      return;
    }
    void loadSnapshot(patientId);
  }, [patientId]);

  const grouped = useMemo(() => {
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = startOfToday.getTime() + 24 * 60 * 60 * 1000;

    const items = snapshot?.items || [];
    return {
      overdue: items.filter((item) => item.status === 'pending' && item.dueAt && item.dueAt < now),
      today: items.filter((item) => item.status === 'pending' && item.dueAt && item.dueAt >= startOfToday.getTime() && item.dueAt < endOfToday),
      upcoming: items.filter((item) => item.status === 'pending' && (!item.dueAt || item.dueAt >= endOfToday)),
      completed: items.filter((item) => item.status !== 'pending'),
    };
  }, [snapshot]);

  const scheduledItems = useMemo(
    () => (snapshot?.items || []).filter((item) => item.dueAt),
    [snapshot]
  );

  const calendarDays = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(calendarMonth)),
        end: endOfWeek(endOfMonth(calendarMonth)),
      }),
    [calendarMonth]
  );

  const selectedDayItems = useMemo(
    () =>
      scheduledItems.filter(
        (item) => item.dueAt && isSameDay(item.dueAt, selectedDay)
      ),
    [scheduledItems, selectedDay]
  );

  const handleCreate = async () => {
    if (!patientId || !form.title.trim()) return;
    setSaving(true);
    setError('');
    try {
      await api.createPatientAssistantItem(patientId, {
        kind: form.kind,
        title: form.title.trim(),
        details: form.details.trim() || undefined,
        dueAt: fromDateTimeInput(form.dueAt),
      });
      setForm({ kind: 'task', title: '', details: '', dueAt: '' });
      await loadSnapshot(patientId);
    } catch (err: any) {
      setError(err.message || 'Unable to create care item');
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (itemId: string, status: 'pending' | 'completed' | 'dismissed') => {
    if (!patientId) return;
    try {
      await api.updatePatientAssistantItem(patientId, itemId, { status });
      await loadSnapshot(patientId);
    } catch (err: any) {
      setError(err.message || 'Unable to update care item');
    }
  };

  const handleDelete = async (itemId: string) => {
    if (!patientId) return;
    try {
      await api.deletePatientAssistantItem(patientId, itemId);
      await loadSnapshot(patientId);
    } catch (err: any) {
      setError(err.message || 'Unable to delete care item');
    }
  };

  const renderItems = (title: string, items: PatientAssistantItemRecord[], emptyLabel: string) => (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
        <span className="text-[10px] text-slate-400">{items.length}</span>
      </div>
      <div className="mt-2 space-y-2">
        {items.length === 0 ? (
          <p className="text-xs text-slate-500">{emptyLabel}</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className={`rounded-xl border p-2.5 ${statusTone(item)}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${kindTone(item.kind)}`}>
                      {iconForKind(item.kind)}
                      {item.kind.replace(/_/g, ' ')}
                    </span>
                    {item.source === 'doctor_plan' ? (
                      <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                        clinician plan
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-800">{item.title}</p>
                  {item.details ? <p className="mt-1 text-xs text-slate-600">{item.details}</p> : null}
                  <p className="mt-1 text-[11px] text-slate-500">{formatDateTime(item.dueAt)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(item.id)}
                  className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500"
                  aria-label={`Delete ${item.title}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {item.status !== 'completed' ? (
                  <button
                    type="button"
                    onClick={() => updateStatus(item.id, 'completed')}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Done
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => updateStatus(item.id, 'pending')}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600"
                  >
                    Reopen
                  </button>
                )}
                {item.status === 'pending' ? (
                  <button
                    type="button"
                    onClick={() => updateStatus(item.id, 'dismissed')}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500"
                  >
                    Dismiss
                  </button>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  if (!patientId) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        Select a patient profile to open the care planner.
      </div>
    );
  }

  return (
    <div className="flex h-auto min-h-[24rem] flex-col gap-3 lg:h-full lg:min-h-0">
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Care Planner</p>
            <p className="mt-1 text-sm text-slate-700">Calendar-style follow-up for medications, appointments, nutrition, and tasks.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-1">
              {(['calendar', 'list'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setView(option)}
                  className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
                    view === option ? 'bg-white text-slate-800 border border-slate-200' : 'text-slate-500'
                  }`}
                >
                  {option === 'calendar' ? 'Calendar' : 'List'}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => patientId && loadSnapshot(patientId)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600"
            >
              <CalendarDays className="h-3.5 w-3.5" /> Refresh
            </button>
          </div>
        </div>

        {snapshot ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700">
              Pending {snapshot.summary.pendingCount}
            </span>
            <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] text-rose-700">
              Overdue {snapshot.summary.overdueCount}
            </span>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
              Today {snapshot.summary.dueTodayCount}
            </span>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700">
              Completed {snapshot.summary.completedCount}
            </span>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Quick Add</p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <select
            value={form.kind}
            onChange={(event) => setForm((current) => ({ ...current, kind: event.target.value as PatientAssistantItemKind }))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
          >
            <option value="task">Task</option>
            <option value="medication">Medication</option>
            <option value="appointment">Appointment</option>
            <option value="nutrition">Nutrition</option>
            <option value="follow_up">Follow-up</option>
          </select>
          <input
            value={form.dueAt}
            onChange={(event) => setForm((current) => ({ ...current, dueAt: event.target.value }))}
            type="datetime-local"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
          />
        </div>
        <input
          value={form.title}
          onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
          placeholder="Metformin at 8am, PCP appointment next Tuesday, hydrate after lunch..."
          className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
        />
        <textarea
          value={form.details}
          onChange={(event) => setForm((current) => ({ ...current, details: event.target.value }))}
          placeholder="Optional details or notes"
          rows={2}
          className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
        />
        <button
          type="button"
          onClick={handleCreate}
          disabled={saving || loading}
          className="mt-2 rounded-lg bg-[#0EA5E9] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Add Care Item'}
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">Loading care planner…</div>
      ) : (
        <div className="space-y-3 overflow-y-auto pr-1 lg:min-h-0">
          {view === 'calendar' ? (
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setCalendarMonth((current) => subMonths(current, 1))}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600"
                >
                  Prev
                </button>
                <p className="text-sm font-semibold text-slate-800">{format(calendarMonth, 'MMMM yyyy')}</p>
                <button
                  type="button"
                  onClick={() => setCalendarMonth((current) => addMonths(current, 1))}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600"
                >
                  Next
                </button>
              </div>

              <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <div key={day}>{day}</div>
                ))}
              </div>

              <div className="mt-2 grid grid-cols-7 gap-1">
                {calendarDays.map((day) => {
                  const itemsForDay = scheduledItems.filter((item) => item.dueAt && isSameDay(item.dueAt, day));
                  const isSelected = isSameDay(day, selectedDay);
                  const isToday = isSameDay(day, new Date());
                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      onClick={() => setSelectedDay(day)}
                      className={`min-h-[5.75rem] rounded-xl border p-1.5 text-left align-top ${
                        isSelected
                          ? 'border-sky-300 bg-sky-50'
                          : isToday
                            ? 'border-amber-200 bg-amber-50'
                            : 'border-slate-200 bg-slate-50'
                      } ${!isSameMonth(day, calendarMonth) ? 'opacity-40' : ''}`}
                    >
                      <p className="text-[11px] font-semibold text-slate-700">{format(day, 'd')}</p>
                      <div className="mt-1 space-y-1">
                        {itemsForDay.slice(0, 2).map((item) => (
                          <div key={item.id} className={`rounded-md border px-1.5 py-1 text-[10px] ${kindTone(item.kind)}`}>
                            {item.title}
                          </div>
                        ))}
                        {itemsForDay.length > 2 ? (
                          <div className="text-[10px] font-semibold text-slate-500">+{itemsForDay.length - 2} more</div>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {format(selectedDay, 'EEEE, MMM d')}
                </p>
                <div className="mt-2 space-y-2">
                  {selectedDayItems.length === 0 ? (
                    <p className="text-xs text-slate-500">No scheduled items on this date.</p>
                  ) : (
                    selectedDayItems.map((item) => (
                      <div key={item.id} className={`rounded-xl border px-3 py-2 ${statusTone(item)}`}>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${kindTone(item.kind)}`}>
                            {item.kind.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-600">{formatDateTime(item.dueAt)}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {grouped.upcoming.filter((item) => !item.dueAt).length > 0 ? (
                <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Unscheduled</p>
                  <div className="mt-2 space-y-2">
                    {grouped.upcoming.filter((item) => !item.dueAt).map((item) => (
                      <div key={item.id} className={`rounded-xl border px-3 py-2 ${statusTone(item)}`}>
                        <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                        <p className="mt-1 text-[11px] text-slate-500">No date set yet</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              {renderItems('Overdue', grouped.overdue, 'No overdue items.')}
              {renderItems('Today', grouped.today, 'Nothing due today.')}
              {renderItems('Upcoming', grouped.upcoming, 'No upcoming items yet.')}
              {renderItems('Completed', grouped.completed, 'Completed items will show here.')}
            </>
          )}
        </div>
      )}
    </div>
  );
}
