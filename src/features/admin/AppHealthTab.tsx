import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonInput,
  IonItem,
  IonList,
  IonSpinner,
  IonText,
  useIonToast,
} from '@ionic/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { supabase } from '../../lib/supabase';
import { BarChart } from '../progress/Charts';
import './admin.css';

// Free-plan limits (Supabase free tier).
const DB_LIMIT = 500 * 1024 * 1024;
const STORAGE_LIMIT = 1024 * 1024 * 1024;

interface Health {
  checked_at: string;
  database_bytes: number;
  largest_tables: { name: string; bytes: number }[];
  storage: { bucket: string; files: number; bytes: number }[];
  users: { clients: number; trainers: number; admins: number; inactive: number };
  push_devices: number;
  push_users: number;
  ai_today: {
    feature: string;
    calls: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  }[];
  ai_month: { calls: number; total_tokens: number };
  ai_models_today?: { model: string; calls: number; total_tokens: number }[];
  ai_last_14_days: { day: string; calls: number; tokens: number }[];
  ai_top_users_today: { name: string; calls: number }[];
  ai_daily_request_limit: number | null;
}

interface ServerStats {
  available: boolean;
  memory_total_bytes?: number | null;
  memory_used_bytes?: number | null;
  cpu_busy_percent?: number | null;
  cpu_cores?: number | null;
  disk_total_bytes?: number | null;
  disk_used_bytes?: number | null;
}

const FEATURE_LABELS: Record<string, string> = {
  'meal-photo': 'Meal photos',
  'meal-text': 'Meals typed in',
  'meal-follow-up': 'Follow-up questions',
  'weekly-summary': 'Weekly summaries',
};

function size(bytes: number | null | undefined) {
  if (bytes === null || bytes === undefined) return '–';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
const num = (n: number) => n.toLocaleString('en-IN');

/** Admin → App health: storage, server, AI usage and users, against free-plan limits. */
export function AppHealthTab() {
  const health = useQuery({
    queryKey: ['admin-health'],
    staleTime: 0,
    queryFn: async (): Promise<Health> => {
      const { data, error } = await supabase.rpc('admin_app_health');
      if (error) throw error;
      return data as unknown as Health;
    },
  });
  const server = useQuery({
    queryKey: ['admin-server-stats'],
    staleTime: 0,
    retry: false,
    queryFn: async (): Promise<ServerStats> => {
      const { data, error } = await supabase.functions.invoke('admin-health', { body: {} });
      if (error) throw error;
      return (data as { data: ServerStats }).data;
    },
  });

  if (health.isPending) {
    return (
      <div className="ion-padding ion-text-center">
        <IonSpinner name="crescent" />
      </div>
    );
  }
  if (health.isError || !health.data) {
    return (
      <IonText color="danger">
        <p className="ion-padding ion-text-center">Couldn't load app health. Tap ↻ to retry.</p>
      </IonText>
    );
  }
  const h = health.data;
  const storageBytes = h.storage.reduce((s, b) => s + Number(b.bytes), 0);
  const aiToday = h.ai_today.reduce(
    (s, a) => ({ calls: s.calls + a.calls, tokens: s.tokens + Number(a.total_tokens) }),
    { calls: 0, tokens: 0 },
  );
  const limit = h.ai_daily_request_limit ?? 20;

  return (
    <div className="health-page">
      <p className="health-note">
        Checked{' '}
        {new Intl.DateTimeFormat('en-IN', { timeStyle: 'short', dateStyle: 'medium' }).format(
          new Date(h.checked_at),
        )}
        . Limits are the free plans. Green under 60%, amber to 85%, red above.
      </p>

      <IonCard className="health-card">
        <IonCardHeader>
          <IonCardSubtitle>Data storage</IonCardSubtitle>
          <IonCardTitle>Database and photos</IonCardTitle>
        </IonCardHeader>
        <IonCardContent>
          <Meter label="Database" used={h.database_bytes} limit={DB_LIMIT} format={size} />
          <Meter label="Photos (storage)" used={storageBytes} limit={STORAGE_LIMIT} format={size} />
          {h.storage.map((b) => (
            <p key={b.bucket} className="health-detail">
              {b.bucket === 'meal-photos'
                ? 'Meal photos (deleted after 7 days)'
                : b.bucket === 'progress-photos'
                  ? 'Progress photos (kept)'
                  : b.bucket}
              : {num(b.files)} files · {size(Number(b.bytes))}
            </p>
          ))}
          <p className="health-detail">
            Largest tables:{' '}
            {h.largest_tables.map((t) => `${t.name} ${size(Number(t.bytes))}`).join(' · ')}
          </p>
        </IonCardContent>
      </IonCard>

      <IonCard className="health-card">
        <IonCardHeader>
          <IonCardSubtitle>Server (Supabase, free plan)</IonCardSubtitle>
          <IonCardTitle>RAM and CPU</IonCardTitle>
        </IonCardHeader>
        <IonCardContent>
          {server.isPending ? (
            <IonSpinner name="dots" />
          ) : !server.data?.available ? (
            <p className="health-detail">
              Server numbers aren't available right now. The rest of the page is unaffected.
            </p>
          ) : (
            <>
              <Meter
                label="RAM"
                used={server.data.memory_used_bytes ?? null}
                limit={server.data.memory_total_bytes ?? null}
                format={size}
              />
              {server.data.disk_total_bytes ? (
                <Meter
                  label="Server disk"
                  used={server.data.disk_used_bytes ?? null}
                  limit={server.data.disk_total_bytes}
                  format={size}
                />
              ) : null}
              <p className="health-detail">
                CPU busy right now: {server.data.cpu_busy_percent ?? '–'}%
                {server.data.cpu_cores ? ` · ${server.data.cpu_cores} cores` : ''}
              </p>
            </>
          )}
        </IonCardContent>
      </IonCard>

      <IonCard className="health-card">
        <IonCardHeader>
          <IonCardSubtitle>Gemini AI (Google, free tier)</IonCardSubtitle>
          <IonCardTitle>AI usage</IonCardTitle>
        </IonCardHeader>
        <IonCardContent>
          <Meter label="Requests today" used={aiToday.calls} limit={limit} format={num} />
          <p className="health-detail">
            Tokens today: {num(aiToday.tokens)} · This month: {num(h.ai_month.calls)} requests,{' '}
            {num(Number(h.ai_month.total_tokens))} tokens
          </p>
          {(h.ai_models_today ?? []).length > 0 && (
            <p className="health-detail">
              Answered by:{' '}
              {h
                .ai_models_today!.map((m) => `${m.model || 'main model'} ${num(Number(m.calls))}`)
                .join(' · ')}
            </p>
          )}
          {h.ai_today.length > 0 && (
            <IonList lines="none" className="health-list">
              {h.ai_today.map((a) => (
                <IonItem key={a.feature}>
                  <span className="health-detail">
                    {FEATURE_LABELS[a.feature] ?? a.feature}: {a.calls} requests ·{' '}
                    {num(Number(a.input_tokens))} in / {num(Number(a.output_tokens))} out tokens
                  </span>
                </IonItem>
              ))}
            </IonList>
          )}
          {h.ai_top_users_today.length > 0 && (
            <p className="health-detail">
              Most meal checks today:{' '}
              {h.ai_top_users_today.map((u) => `${u.name} (${u.calls})`).join(', ')}. Each client
              can do 15 a day.
            </p>
          )}
          {h.ai_last_14_days.length > 0 && (
            <BarChart
              points={lastDays(h.ai_last_14_days)}
              // Show the limit line only once usage is a noticeable share of it.
              target={
                Math.max(...h.ai_last_14_days.map((d) => Number(d.calls))) >= limit * 0.2
                  ? limit
                  : undefined
              }
              label="AI requests per day, last 14 days"
            />
          )}
          <LimitEditor current={limit} />
          <p className="health-detail">
            Token counts are recorded from 19 Oct 2026. Each Google model has its own free daily
            quota; when the main one is used up, FitCoach switches to the backup models. Set the
            limit above to the total of all their daily quotas (from Google AI Studio → Rate limit).
          </p>
        </IonCardContent>
      </IonCard>

      <IonCard className="health-card">
        <IonCardHeader>
          <IonCardSubtitle>People</IonCardSubtitle>
          <IonCardTitle>Users and devices</IonCardTitle>
        </IonCardHeader>
        <IonCardContent>
          <p className="health-detail">
            {h.users.clients} clients · {h.users.trainers} trainers · {h.users.admins} admin
            {h.users.inactive ? ` · ${h.users.inactive} deactivated` : ''}
          </p>
          <p className="health-detail">
            {`Notifications on for ${h.push_users} ${h.push_users === 1 ? 'person' : 'people'} ` +
              `(${h.push_devices} ${h.push_devices === 1 ? 'device' : 'devices'}).`}
          </p>
        </IonCardContent>
      </IonCard>
    </div>
  );
}

/** Fill in missing days with 0 so the chart shows all 14. */
function lastDays(rows: { day: string; calls: number }[]) {
  const byDay = new Map(rows.map((r) => [r.day, Number(r.calls)]));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.parse(`${today}T00:00:00Z`) - (13 - i) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    return { date: d, value: byDay.get(d) ?? 0 };
  });
}

function Meter({
  label,
  used,
  limit,
  format,
}: {
  label: string;
  used: number | null;
  limit: number | null;
  format: (n: number) => string;
}) {
  const pct = used !== null && limit ? Math.min(100, (used / limit) * 100) : null;
  const level = pct === null ? 'ok' : pct >= 85 ? 'bad' : pct >= 60 ? 'warn' : 'ok';
  return (
    <div className="health-meter">
      <div className="health-meter-label">
        <span>{label}</span>
        <span>
          {used === null ? '–' : format(used)} of {limit === null ? '–' : format(limit)}
          {pct !== null ? ` · ${pct < 1 ? '<1' : Math.round(pct)}%` : ''}
        </span>
      </div>
      <div className="health-bar">
        <div
          className={`health-bar-fill ${level}`}
          style={{ width: `${Math.max(pct ?? 0, 1)}%` }}
        />
      </div>
    </div>
  );
}

function LimitEditor({ current }: { current: number }) {
  const qc = useQueryClient();
  const [toast] = useIonToast();
  const [value, setValue] = useState(String(current));
  const save = useMutation({
    mutationFn: async (n: number) => {
      const { error } = await supabase
        .from('app_settings')
        .upsert({ key: 'ai_daily_request_limit', value: n, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-health'] }),
  });
  const n = Math.round(Number(value));
  const changed = Number.isFinite(n) && n > 0 && n !== current;

  return (
    <div className="health-limit">
      <IonInput
        fill="outline"
        label="Daily AI request limit (all models together)"
        labelPlacement="stacked"
        type="number"
        inputmode="numeric"
        value={value}
        onIonInput={(e) => setValue(String(e.detail.value ?? ''))}
      />
      {changed && (
        <IonButton
          disabled={save.isPending}
          onClick={() =>
            save.mutate(n, {
              onSuccess: () => void toast({ message: 'Saved', duration: 1200, position: 'top' }),
              onError: () =>
                void toast({ message: 'Could not save', duration: 2000, color: 'danger' }),
            })
          }
        >
          Save
        </IonButton>
      )}
    </div>
  );
}
