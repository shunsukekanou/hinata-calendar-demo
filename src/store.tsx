import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { FamilyEvent, Member, ViewMode } from './types';
import { formatDate } from './utils/holidayUtils';
import { occursOn } from './utils/repeat';
import { defaultReminders } from './utils/reminders';
import { loadSettings, saveSettings } from './utils/settings';
import type { WeekStart } from './utils/settings';
import { supabase } from './utils/supabase';
import { baseEvents } from './demoData';
import {
  FATHER_ID,
  allAsUpserts,
  applyPending,
  diffOps,
  eventToRow,
  holidayRowToEvent,
  holidayToRow,
  isHoliday,
  isSeeded,
  loadPending,
  markSeeded,
  rowToEvent,
  savePending,
} from './utils/sync';
import type { EventRow, HolidayRow, PendingMap } from './utils/sync';

export { FATHER_ID };

// 家族の4人（この並び順）。会社の休みは「たかしの休み」として扱う
export const MEMBERS: Member[] = [
  { id: 'father', name: 'たかし', color: '#2f6fb5', soft: '#e3eefb' },
  { id: 'mother', name: 'みさき', color: '#d0587a', soft: '#fbe6ed' },
  { id: 'daughter', name: 'あおい', color: '#d98a1f', soft: '#fdf0d9' },
  { id: 'son', name: 'りく', color: '#3b9b6a', soft: '#e1f4ea' },
];
export const ALL_COLOR = '#7a6a5c';
export const ALL_SOFT = '#efe8e0';

const STORAGE_KEY = 'hinata_family_calendar_v1';

interface Saved {
  events: FamilyEvent[];
  year: number;
  month: number;
  view: ViewMode;
}

function load(): Partial<Saved> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // 読めなければ空の状態から始める
  }
  return {};
}

// 取り込みの画面：menu＝入口（2つの分類）／sync＝自動同期／file＝ファイル取り込みの入口／ics・image・backup＝それぞれの画面
export type ImportKind = 'menu' | 'sync' | 'google' | 'file' | 'ics' | 'image' | 'backup';

export type EditorTarget = { event: FamilyEvent } | { date: string; memberId?: string } | null;

// 同期の状態（画面の「同期済み」などの表示用）
export interface SyncInfo {
  state: 'off' | 'syncing' | 'ok' | 'offline' | 'error';
  pending: number; // まだサーバーに送れていない変更の数
  lastSyncedAt?: number;
  message?: string;
}

interface Store {
  members: Member[];
  events: FamilyEvent[];
  year: number;
  month: number;
  view: ViewMode;
  selectedDate: string;
  setView: (v: ViewMode) => void;
  setSelectedDate: (d: string) => void;
  goNext: () => void;
  goPrev: () => void;
  goToday: () => void;
  weekStart: 0 | 1; // 週の始まり（0＝日曜日、1＝月曜日）。⚙️設定で切り替える
  setWeekStart: (w: WeekStart) => void;
  navSeq: number; // 矢印・スワイプ・「今日」で月を移すたびに増える（一覧・タイムラインが、その月の頭へ寄せるための合図）
  scrollMonth: (y: number, m: number) => void; // スクロールして別の月に入ったとき、上の月の表示だけを変える（寄せ直しは起こさない）
  todayTick: number; // 「今日」ボタンを押すたびに増える（同じ月のままでも、表示を今日へ寄せ直すため）
  addEvent: (e: Omit<FamilyEvent, 'id'>) => void;
  updateEvent: (e: FamilyEvent) => void;
  deleteEvent: (id: string) => void;
  importEvents: (list: Omit<FamilyEvent, 'id'>[]) => number;
  addDefaultReminders: () => number;
  setFatherOff: (dates: string[], on: boolean) => void;
  exportJson: () => string;
  importJson: (text: string) => boolean;
  clearAll: () => void;
  resetDemo: () => void; // デモ版：予定を、初めの状態（家族の行事・仕事・学校だけ）に戻す
  sync: SyncInfo;
  syncNow: () => void;
  // 画面の開閉
  daySheet: string | null;
  openDaySheet: (d: string | null) => void;
  editor: EditorTarget;
  openEditor: (t: EditorTarget) => void;
  importOpen: ImportKind | null;
  openImport: (k: ImportKind | null) => void;
}

const Ctx = createContext<Store | undefined>(undefined);

let seq = 0;
const newId = () => `ev-${Date.now()}-${seq++}-${Math.random().toString(36).slice(2, 6)}`;
// デモ版：初めて開いたとき（まだ何も保存されていないとき）に入れておく予定
const seedEvents = (): FamilyEvent[] => baseEvents().map((e) => ({ ...e, id: newId() }));

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const saved = useMemo(load, []);
  const today = new Date();
  const [events, setEvents] = useState<FamilyEvent[]>(Array.isArray(saved.events) ? saved.events : seedEvents());
  const eventsRef = useRef<FamilyEvent[]>(events);
  const pendingRef = useRef<PendingMap>(supabase ? loadPending() : {});
  const busyRef = useRef(false);
  const rerunRef = useRef(false);
  const [sync, setSync] = useState<SyncInfo>({ state: supabase ? 'syncing' : 'off', pending: Object.keys(pendingRef.current).length });

  const setPending = (p: PendingMap) => {
    pendingRef.current = p;
    savePending(p);
    setSync((s) => ({ ...s, pending: Object.keys(p).length }));
  };

  // サーバーとの同期：①未送信の変更を送る → ②サーバーの最新を取ってくる（未送信の変更は上に重ねる）
  const syncNow = useCallback(async () => {
    if (!supabase) return;
    if (busyRef.current) {
      rerunRef.current = true;
      return;
    }
    busyRef.current = true;
    setSync((s) => ({ ...s, state: 'syncing', message: undefined }));
    const check = (error: { message: string } | null) => {
      if (error) throw new Error(error.message);
    };
    try {
      // 初めての同期：この端末にすでにある予定を、全部サーバーに送る対象にする
      if (!isSeeded()) {
        setPending({ ...allAsUpserts(eventsRef.current), ...pendingRef.current });
        markSeeded();
      }
      // ① 送る
      for (const [k, p] of Object.entries(pendingRef.current)) {
        const e = p.event;
        if (isHoliday(e)) {
          if (p.op === 'upsert') check((await supabase.from('holidays').upsert(holidayToRow(e), { onConflict: 'date' })).error);
          else check((await supabase.from('holidays').delete().eq('date', e.date)).error);
        } else if (p.op === 'upsert') {
          check((await supabase.from('events').upsert(eventToRow(e))).error);
        } else {
          check((await supabase.from('events').delete().eq('id', e.id)).error);
        }
        // 送っている間に同じ予定がまた変わっていたら、新しい変更を残す
        if (pendingRef.current[k] === p) {
          const rest = { ...pendingRef.current };
          delete rest[k];
          setPending(rest);
        }
      }
      // ② 取ってくる
      const [ev, ho] = await Promise.all([supabase.from('events').select('*'), supabase.from('holidays').select('*')]);
      check(ev.error);
      check(ho.error);
      const remote = [
        ...((ev.data ?? []) as EventRow[]).map(rowToEvent),
        ...((ho.data ?? []) as HolidayRow[]).filter((r) => r.is_father_off).map(holidayRowToEvent),
      ];
      const merged = applyPending(remote, pendingRef.current);
      if (JSON.stringify(merged) !== JSON.stringify(eventsRef.current)) {
        eventsRef.current = merged;
        setEvents(merged);
      }
      setSync((s) => ({ ...s, state: 'ok', lastSyncedAt: Date.now(), message: undefined }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const offline = !navigator.onLine || /fetch|network|failed to|load failed/i.test(message);
      setSync((s) => ({ ...s, state: offline ? 'offline' : 'error', message: offline ? '電波が届いていません。変更はこの端末に残してあり、つながったら自動で送ります。' : message }));
    } finally {
      busyRef.current = false;
      if (rerunRef.current) {
        rerunRef.current = false;
        void syncNow();
      }
    }
  }, []);

  // 予定の一覧を書き換える入口。画面とこの端末に反映し、サーバーに送る変更を覚えて同期を始める
  const mutate = (fn: (p: FamilyEvent[]) => FamilyEvent[]) => {
    const prev = eventsRef.current;
    const next = fn(prev);
    eventsRef.current = next;
    setEvents(next);
    if (!supabase) return;
    const ops = diffOps(prev, next);
    if (Object.keys(ops).length === 0) return;
    setPending({ ...pendingRef.current, ...ops });
    void syncNow();
  };

  // 開いたとき・電波が戻ったとき・画面に戻ったとき・1分ごと、そして他の端末の変更（Realtime）で同期する
  useEffect(() => {
    if (!supabase) return;
    void syncNow();
    let timer: number | undefined;
    const soon = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void syncNow(), 400);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') soon();
    };
    window.addEventListener('online', soon);
    document.addEventListener('visibilitychange', onVisible);
    const interval = window.setInterval(() => void syncNow(), 60 * 1000); // Realtime が使えないときの保険
    const channel = supabase
      .channel('family-calendar')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'holidays' }, soon)
      .subscribe();
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener('online', soon);
      document.removeEventListener('visibilitychange', onVisible);
      void supabase?.removeChannel(channel);
    };
  }, [syncNow]);
  // 開いたときの月：設定が「いつも今月」なら今日の月（初期値）、「閉じる前の月をキープ」なら前回の月
  const keepMonth = useMemo(() => loadSettings().startMonth === 'keep', []);
  const [year, setYear] = useState((keepMonth ? saved.year : undefined) ?? today.getFullYear());
  const [month, setMonth] = useState((keepMonth ? saved.month : undefined) ?? today.getMonth() + 1);
  const [view, setView] = useState<ViewMode>(saved.view ?? 'month');
  const [selectedDate, setSelectedDate] = useState(formatDate(today));
  const [daySheet, openDaySheet] = useState<string | null>(null);
  const [editor, openEditor] = useState<EditorTarget>(null);
  const [importOpen, openImport] = useState<Store['importOpen']>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ events, year, month, view }));
    } catch {
      // 保存できなくても画面は動かす
    }
  }, [events, year, month, view]);

  const [navSeq, setNavSeq] = useState(0);
  const scrollMonth = (y: number, m: number) => {
    setYear(y);
    setMonth(m);
  };
  const goNext = () => {
    setNavSeq((n) => n + 1);
    if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else setMonth(month + 1);
  };
  const goPrev = () => {
    setNavSeq((n) => n + 1);
    if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else setMonth(month - 1);
  };
  const [weekStartSetting, setWeekStartSetting] = useState<WeekStart>(() => loadSettings().weekStart);
  const setWeekStart = (w: WeekStart) => {
    setWeekStartSetting(w);
    saveSettings({ ...loadSettings(), weekStart: w });
  };
  const [todayTick, setTodayTick] = useState(0);
  const goToday = () => {
    setTodayTick((n) => n + 1);
    setNavSeq((n) => n + 1);
    const t = new Date();
    setYear(t.getFullYear());
    setMonth(t.getMonth() + 1);
    setSelectedDate(formatDate(t));
  };

  const addEvent = (e: Omit<FamilyEvent, 'id'>) => mutate((p) => [...p, { ...e, id: newId() }]);
  const updateEvent = (e: FamilyEvent) => mutate((p) => p.map((x) => (x.id === e.id ? e : x)));
  const deleteEvent = (id: string) => mutate((p) => p.filter((x) => x.id !== id));

  // .ics などからの取り込み。同じ UID の予定が前に取り込んであれば入れ替える（二重にならない）
  const importEvents = (list: Omit<FamilyEvent, 'id'>[]) => {
    const uids = new Set(list.map((e) => e.uid).filter(Boolean));
    mutate((p) => [...p.filter((x) => !(x.uid && uids.has(x.uid))), ...list.map((e) => ({ ...e, id: newId() }))]);
    return list.length;
  };

  // 通知のない予定（これから先のもの・毎年の予定）に、初めの通知（時刻つき＝30分前／終日＝当日の朝8時）をまとめて付ける
  const addDefaultReminders = () => {
    const todayStr = formatDate(new Date());
    const targets = eventsRef.current.filter((e) => e.kind !== 'off' && !e.reminders?.length && (e.repeat === 'yearly' || (e.endDate || e.date) >= todayStr));
    if (!targets.length) return 0;
    const ids = new Set(targets.map((e) => e.id));
    mutate((p) => p.map((e) => (ids.has(e.id) ? { ...e, reminders: defaultReminders(e.allDay) } : e)));
    return targets.length;
  };

  // 会社の休み = たかしの休み。1日1件の「お休み」予定として持つ（サーバーでは holidays の1行）
  const setFatherOff = (dates: string[], on: boolean) => {
    mutate((p) => {
      const set = new Set(dates);
      const rest = p.filter((x) => !(x.kind === 'off' && x.memberIds.length === 1 && x.memberIds[0] === FATHER_ID && !x.endDate && !x.repeat && set.has(x.date)));
      if (!on) return rest;
      return [
        ...rest,
        ...dates.map<FamilyEvent>((d) => ({
          id: `off-${d}`,
          title: 'お休み',
          date: d,
          allDay: true,
          memberIds: [FATHER_ID],
          kind: 'off',
          source: 'image',
        })),
      ];
    });
  };

  const exportJson = () => JSON.stringify({ app: 'hinata-family-calendar', version: 1, exportedAt: new Date().toISOString(), events }, null, 2);
  const importJson = (text: string) => {
    try {
      const d = JSON.parse(text);
      if (!Array.isArray(d.events)) return false;
      mutate(() => d.events);
      return true;
    } catch {
      return false;
    }
  };
  const clearAll = () => mutate(() => []);
  const resetDemo = () => mutate(() => seedEvents());

  const value: Store = {
    members: MEMBERS,
    events,
    year,
    month,
    view,
    selectedDate,
    setView: useCallback((v: ViewMode) => setView(v), []),
    setSelectedDate,
    goNext,
    goPrev,
    goToday,
    weekStart: weekStartSetting === 'mon' ? 1 : 0,
    setWeekStart,
    todayTick,
    navSeq,
    scrollMonth,
    addEvent,
    updateEvent,
    deleteEvent,
    importEvents,
    addDefaultReminders,
    setFatherOff,
    exportJson,
    importJson,
    clearAll,
    resetDemo,
    sync,
    syncNow: () => void syncNow(),
    daySheet,
    openDaySheet,
    editor,
    openEditor,
    importOpen,
    openImport,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useStore = (): Store => {
  const c = useContext(Ctx);
  if (!c) throw new Error('StoreProvider がありません');
  return c;
};

// ---- 予定の見せ方の共通部品 ----
export function eventsOn(events: FamilyEvent[], date: string): FamilyEvent[] {
  return events
    .filter((e) => occursOn(e, date))
    .sort((a, b) => Number(!!b.allDay) - Number(!!a.allDay) || (a.startTime ?? '').localeCompare(b.startTime ?? '') || a.title.localeCompare(b.title));
}

export function appliesTo(e: FamilyEvent, memberId: string): boolean {
  return e.memberIds.length === 0 || e.memberIds.includes(memberId);
}

export function memberLabel(e: FamilyEvent, members: Member[]): string {
  if (e.memberIds.length === 0 || e.memberIds.length === members.length) return '全体';
  return e.memberIds.map((id) => members.find((m) => m.id === id)?.name ?? '').filter(Boolean).join('・');
}

export function timeLabel(e: FamilyEvent): string {
  if (e.allDay || !e.startTime) return '終日';
  return e.endTime ? `${e.startTime}〜${e.endTime}` : `${e.startTime}〜`;
}
