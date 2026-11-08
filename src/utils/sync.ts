// アプリの予定 ⇔ Supabase の表（events / holidays）の変換と、未送信の変更のキュー
//
// events テーブル : id, member, title, date, start_time, end_time, category, memo
// holidays テーブル: date, is_father_off, memo
//
// 表には「最終日」「元の取り込み方」「.ics の ID」の列がないので、category の後ろに
//   お休み;end=2026-10-22;src=ics;uid=...;rem=m30,a8   のようにまとめて入れる（member・時刻・メモは普通の列）。
// たかしの1日だけの「お休み」は holidays テーブルに入れる（Gemini の設計どおり）。
import type { FamilyEvent } from '../types';
import { normalizeReminders } from './reminders';

export const FATHER_ID = 'father';

export interface EventRow {
  id: string;
  member: string | null;
  title: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  category: string | null;
  memo: string | null;
}

export interface HolidayRow {
  date: string;
  is_father_off: boolean;
  memo: string | null;
}

export type PendingOp = { op: 'upsert' | 'delete'; event: FamilyEvent };
export type PendingMap = Record<string, PendingOp>;

// たかしの1日だけのお休み（holidays テーブルに入れるもの）
export const isHoliday = (e: FamilyEvent): boolean => e.kind === 'off' && e.memberIds.length === 1 && e.memberIds[0] === FATHER_ID && !e.endDate && !e.repeat; // 毎年繰り返すものは、holidays 表には入らない（繰り返しの印を持てないため）

export const keyOf = (e: FamilyEvent): string => (isHoliday(e) ? `h:${e.date}` : `e:${e.id}`);

export function eventToRow(e: FamilyEvent): EventRow {
  const extras: string[] = [];
  if (e.endDate) extras.push(`end=${e.endDate}`);
  if (e.source) extras.push(`src=${e.source}`);
  if (e.uid) extras.push(`uid=${encodeURIComponent(e.uid)}`);
  if (e.sourceName) extras.push(`cal=${encodeURIComponent(e.sourceName)}`);
  if (e.repeat) extras.push(`rep=${e.repeat}`);
  if (e.reminders?.length) extras.push(`rem=${e.reminders.join(',')}`);
  return {
    id: e.id,
    member: e.memberIds.length ? e.memberIds.join(',') : 'all',
    title: e.title,
    date: e.date,
    start_time: e.allDay ? null : e.startTime || null,
    end_time: e.allDay ? null : e.endTime || null,
    category: [e.kind, ...extras].join(';'),
    memo: e.note || null,
  };
}

export function rowToEvent(r: EventRow): FamilyEvent {
  const [kind, ...extras] = (r.category || 'event').split(';');
  const x: Record<string, string> = {};
  extras.forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) x[p.slice(0, i)] = p.slice(i + 1);
  });
  const member = (r.member || '').trim();
  const ids = !member || member === 'all' ? [] : member.split(',').map((s) => s.trim()).filter(Boolean);
  const startTime = r.start_time ? r.start_time.slice(0, 5) : undefined;
  return {
    id: r.id,
    title: r.title,
    date: String(r.date).slice(0, 10),
    endDate: x.end || undefined,
    startTime,
    endTime: startTime && r.end_time ? r.end_time.slice(0, 5) : undefined,
    allDay: !startTime,
    memberIds: ids,
    kind: kind === 'off' ? 'off' : 'event',
    note: r.memo || undefined,
    source: x.src === 'ics' || x.src === 'image' || x.src === 'manual' || x.src === 'google' ? x.src : undefined,
    uid: x.uid ? decodeURIComponent(x.uid) : undefined,
    sourceName: x.cal ? decodeURIComponent(x.cal) : undefined,
    repeat: x.rep === 'yearly' ? 'yearly' : undefined,
    reminders: x.rem ? normalizeReminders(x.rem.split(',')) : undefined,
  };
}

export const holidayToRow = (e: FamilyEvent): HolidayRow => ({ date: e.date, is_father_off: true, memo: e.note || null });

export const holidayRowToEvent = (r: HolidayRow): FamilyEvent => ({
  id: `off-${String(r.date).slice(0, 10)}`,
  title: 'お休み',
  date: String(r.date).slice(0, 10),
  allDay: true,
  memberIds: [FATHER_ID],
  kind: 'off',
  note: r.memo || undefined,
  source: 'image',
});

// 変更の比べ方：表に保存される形が同じなら「変わっていない」とみなす
const signature = (e: FamilyEvent): string => JSON.stringify(isHoliday(e) ? ['h', e.date, e.note || ''] : eventToRow(e));

function toMap(list: FamilyEvent[]): Map<string, { sig: string; e: FamilyEvent }> {
  const m = new Map<string, { sig: string; e: FamilyEvent }>();
  list.forEach((e) => m.set(keyOf(e), { sig: signature(e), e }));
  return m;
}

// 前の一覧と今の一覧を比べて、サーバーに送る変更（追加・更新・削除）を作る
export function diffOps(prev: FamilyEvent[], next: FamilyEvent[]): PendingMap {
  const pm = toMap(prev);
  const nm = toMap(next);
  const ops: PendingMap = {};
  nm.forEach((n, k) => {
    if (pm.get(k)?.sig !== n.sig) ops[k] = { op: 'upsert', event: n.e };
  });
  pm.forEach((p, k) => {
    if (!nm.has(k)) ops[k] = { op: 'delete', event: p.e };
  });
  return ops;
}

// サーバーの内容に、まだ送れていない変更を重ねた一覧
export function applyPending(remote: FamilyEvent[], pending: PendingMap): FamilyEvent[] {
  const byKey = new Map<string, FamilyEvent>();
  remote.forEach((e) => byKey.set(keyOf(e), e));
  Object.entries(pending).forEach(([k, p]) => {
    if (p.op === 'upsert') byKey.set(k, p.event);
    else byKey.delete(k);
  });
  return [...byKey.values()];
}

export const allAsUpserts = (list: FamilyEvent[]): PendingMap => {
  const ops: PendingMap = {};
  list.forEach((e) => (ops[keyOf(e)] = { op: 'upsert', event: e }));
  return ops;
};

// ---- 未送信の変更を端末に覚えておく（電波がなくても消えない）----
const PENDING_KEY = 'hinata_family_calendar_pending_v1';
const SEEDED_KEY = 'hinata_family_calendar_seeded_v1';

export function loadPending(): PendingMap {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (raw) return JSON.parse(raw) as PendingMap;
  } catch {
    // 読めなければ空から
  }
  return {};
}
export function savePending(p: PendingMap) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(p));
  } catch {
    // 保存できなくても動かす
  }
}
export const isSeeded = (): boolean => {
  try {
    return localStorage.getItem(SEEDED_KEY) === '1';
  } catch {
    return false;
  }
};
export const markSeeded = () => {
  try {
    localStorage.setItem(SEEDED_KEY, '1');
  } catch {
    // 無視
  }
};
