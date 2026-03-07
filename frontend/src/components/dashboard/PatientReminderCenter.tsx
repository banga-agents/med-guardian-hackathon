'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { BellRing, Clock3 } from 'lucide-react';
import { api, type PatientAssistantItemRecord, type PatientAssistantSnapshotRecord } from '@/lib/api';
import type { PatientId } from '@/types/simulation';

const REMINDER_WINDOW_MS = 2 * 60 * 60 * 1000;
const STORAGE_KEY = 'medguardian-reminder-notices';

function formatDue(value?: number): string {
  if (!value) return 'No scheduled time';
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function readSeenNotifications(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as string[] : [];
  } catch {
    return [];
  }
}

function writeSeenNotifications(values: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values.slice(-200)));
  } catch {
    // ignore storage failures
  }
}

export function PatientReminderCenter({ patientId }: { patientId?: PatientId | null }) {
  const [snapshot, setSnapshot] = useState<PatientAssistantSnapshotRecord | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | 'unavailable'>(() => {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return 'unavailable';
    return Notification.permission;
  });
  const seenRef = useRef<string[]>([]);

  useEffect(() => {
    seenRef.current = readSeenNotifications();
  }, []);

  useEffect(() => {
    if (!patientId) {
      setSnapshot(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const response = await api.getPatientAssistantSnapshot(patientId);
        if (!cancelled) {
          setSnapshot(response.data);
        }
      } catch {
        if (!cancelled) {
          setSnapshot(null);
        }
      }
    };

    void load();
    const interval = window.setInterval(load, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [patientId]);

  const reminderItems = useMemo(() => {
    const now = Date.now();
    return (snapshot?.items || [])
      .filter((item) => item.status === 'pending' && item.dueAt)
      .filter((item) => (item.dueAt as number) <= now + REMINDER_WINDOW_MS)
      .sort((left, right) => (left.dueAt || 0) - (right.dueAt || 0))
      .slice(0, 4);
  }, [snapshot]);

  useEffect(() => {
    if (permission !== 'granted') return;
    if (typeof Notification === 'undefined') return;

    const nextSeen = [...seenRef.current];
    reminderItems.forEach((item) => {
      const fingerprint = `${item.id}:${item.dueAt}`;
      if (nextSeen.includes(fingerprint)) return;
      const isOverdue = Boolean(item.dueAt && item.dueAt < Date.now());
      const notice = new Notification(isOverdue ? 'MedGuardian overdue reminder' : 'MedGuardian reminder', {
        body: `${item.title} • ${formatDue(item.dueAt)}`,
        tag: fingerprint,
      });
      notice.onclick = () => window.focus();
      nextSeen.push(fingerprint);
    });
    seenRef.current = nextSeen;
    writeSeenNotifications(nextSeen);
  }, [permission, reminderItems]);

  const requestBrowserAlerts = async () => {
    if (typeof Notification === 'undefined') {
      setPermission('unavailable');
      return;
    }
    const nextPermission = await Notification.requestPermission();
    setPermission(nextPermission);
  };

  if (!patientId || reminderItems.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
            <BellRing className="h-4 w-4" /> Reminders
          </p>
          <p className="mt-1 text-sm text-amber-900">Due soon and overdue care items stay pinned here while you are in patient mode.</p>
        </div>
        {permission === 'default' ? (
          <button
            type="button"
            onClick={() => void requestBrowserAlerts()}
            className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-700"
          >
            Enable alerts
          </button>
        ) : null}
      </div>

      <div className="mt-3 space-y-2">
        {reminderItems.map((item: PatientAssistantItemRecord) => {
          const overdue = Boolean(item.dueAt && item.dueAt < Date.now());
          return (
            <div key={item.id} className="rounded-xl border border-amber-200 bg-white px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  overdue ? 'bg-rose-50 text-rose-700' : 'bg-amber-100 text-amber-800'
                }`}>
                  {overdue ? 'Overdue' : 'Due soon'}
                </span>
              </div>
              <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-600">
                <Clock3 className="h-3.5 w-3.5" /> {formatDue(item.dueAt)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
