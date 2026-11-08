// .ics（TimeTree・Google カレンダーなどの書き出しファイル）の読み取り
//
// 取りこぼしを減らすための決まり：
//   ・行末の空白、大文字小文字、BOM（ファイルの頭の目印）、改行コードの違いがあっても読む
//   ・予定の中の「通知（VALARM）」の説明文を、予定のメモと取り違えない
//   ・タイムゾーン（TZID）つきの時刻は、その地域の時刻として読み、この端末の時刻に直す
//   ・終わりが DTEND でなく DURATION（長さ）で書かれていても読む
//   ・取り消し済み（STATUS:CANCELLED）の予定は入れない
//   ・繰り返しの予定の「この回だけ変更・移動」（RECURRENCE-ID）は、元の回と二重にならないようにする
//   ・読めなかった予定は、黙って捨てず、理由つきで画面に出せるよう、一覧（skipped）で返す
import type { FamilyEvent, Member } from '../types';
import { formatDate } from './holidayUtils';
import { loadAliases } from './settings';

export interface IcsDraft {
  key: string;
  title: string;
  date: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  allDay: boolean;
  note?: string;
  uid: string;
  memberIds: string[]; // 自動で振り分けた結果（空 = 全員）
  matched: boolean; // 名前から振り分けられたか
  skip?: boolean; // 初めは取り込まない（チェックを外しておく）予定
}

/** 取り込めなかった予定（画面で理由つきで見せる） */
export interface IcsSkipped {
  title: string;
  date?: string;
  reason: string;
}

export interface IcsReport {
  drafts: IcsDraft[];
  skipped: IcsSkipped[];
  totalEvents: number; // ファイルに入っていた予定の数（繰り返しを広げる前）
  rangeFrom: string;
  rangeTo: string;
}

interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}
interface RawVEvent {
  props: Prop[];
}

// ---- 文字・行の読み取り ----
function unfold(text: string): string[] {
  const out: string[] = [];
  for (const line of text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n')) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length) out[out.length - 1] += line.slice(1);
    else out.push(line);
  }
  return out.map((l) => l.replace(/[ \t]+$/, ''));
}

function unescapeText(v: string): string {
  return v.replace(/\\[nN]/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

// 「"」の中の : や ; は区切りとして数えない（例：CN="山田; 太郎"）
function splitOutsideQuotes(s: string, sep: string): string[] {
  const parts: string[] = [];
  let cur = '';
  let inQ = false;
  for (const c of s) {
    if (c === '"') inQ = !inQ;
    if (c === sep && !inQ) {
      parts.push(cur);
      cur = '';
    } else cur += c;
  }
  parts.push(cur);
  return parts;
}

function parseProp(line: string): Prop | null {
  let inQ = false;
  let idx = -1;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQ = !inQ;
    else if (c === ':' && !inQ) {
      idx = i;
      break;
    }
  }
  if (idx < 0) return null;
  const head = splitOutsideQuotes(line.slice(0, idx), ';');
  const params: Record<string, string> = {};
  head.slice(1).forEach((p) => {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  });
  return { name: head[0].trim().toUpperCase(), params, value: line.slice(idx + 1) };
}

// ---- 日付・時刻 ----
const MS_DAY = 86400000;
const U = (d: string) => {
  const [y, m, dd] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, dd);
};
const F = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};
const addDaysStr = (d: string, n: number) => F(U(d) + n * MS_DAY);
const diffDays = (a: string, b: string) => Math.round((U(b) - U(a)) / MS_DAY);
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const dowOf = (d: string) => new Date(U(d)).getUTCDay();

interface DT {
  date: string; // この端末の日付
  time?: string; // この端末の時刻 HH:mm
  allDay: boolean;
  ms: number;
}

// 指定した地域（例 Asia/Tokyo）の「その場所の時刻」→ 世界共通の時刻（ミリ秒）。読めない地域名は null
function zonedToMs(y: number, mo: number, d: number, h: number, mi: number, tz: string): number | null {
  const names = [tz, tz.replace(/^\/+/, ''), tz.split('/').slice(-2).join('/'), tz.split('/').slice(-1)[0]];
  for (const name of names) {
    try {
      const fmt = new Intl.DateTimeFormat('en-US', { timeZone: name, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const offset = (t: number) => {
        const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
        return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - t;
      };
      const guess = Date.UTC(y, mo - 1, d, h, mi);
      return guess - offset(guess - offset(guess));
    } catch {
      // 次の候補へ
    }
  }
  return null;
}

function parseDT(value: string, params: Record<string, string>): DT | null {
  const m = value.trim().match(/^(\d{4})-?(\d{2})-?(\d{2})(?:[Tt ](\d{2}):?(\d{2})(?::?(\d{2}))?(Z|z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, hh, mi, , z] = m;
  if ((params.VALUE ?? '').toUpperCase() === 'DATE' || hh === undefined) {
    const date = `${y}-${mo}-${d}`;
    return { date, allDay: true, ms: U(date) };
  }
  let ms: number;
  if (z) ms = Date.UTC(+y, +mo - 1, +d, +hh, +mi);
  else {
    const zoned = params.TZID ? zonedToMs(+y, +mo, +d, +hh, +mi, params.TZID) : null;
    // 地域名が無い・読めないときは、この端末の時刻として読む（浮動時刻）
    ms = zoned ?? new Date(+y, +mo - 1, +d, +hh, +mi).getTime();
  }
  const dt = new Date(ms);
  return { date: formatDate(dt), time: `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`, allDay: false, ms };
}

// 長さ（PT1H30M・P1D・P1W など）→ ミリ秒
function parseDuration(v: string): number | null {
  const m = v.trim().match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!m) return null;
  const [, sign, w, d, h, mi, s] = m;
  const ms = ((Number(w || 0) * 7 + Number(d || 0)) * 86400 + Number(h || 0) * 3600 + Number(mi || 0) * 60 + Number(s || 0)) * 1000;
  return sign === '-' ? -ms : ms;
}

// ---- 繰り返し ----
const DOW = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

// y年m月の「n番目の曜日」（n が負なら、後ろから）。無ければ null
function nthWeekday(y: number, m: number, n: number, dow: number): number | null {
  const last = daysInMonth(y, m);
  if (n > 0) {
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const day = 1 + ((dow - first + 7) % 7) + (n - 1) * 7;
    return day <= last ? day : null;
  }
  const lastDow = new Date(Date.UTC(y, m - 1, last)).getUTCDay();
  const day = last - ((lastDow - dow + 7) % 7) + (n + 1) * 7;
  return day >= 1 ? day : null;
}

/**
 * 繰り返し（毎日・毎週・毎月・毎年。曜日指定・毎月の何日・第n曜日つき）を、取り込む期間の中だけ広げる。
 * 返すのは、日付（YYYY-MM-DD）の一覧。先頭の日（DTSTART）は、いつも1回目として数える。
 */
function expandRrule(rule: string, start: string, exdates: Set<string>, rdates: string[], fromStr: string, toStr: string): string[] {
  const r: Record<string, string> = {};
  rule.split(';').forEach((p) => {
    const eq = p.indexOf('=');
    if (eq > 0) r[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
  });
  const freq = (r.FREQ ?? '').toUpperCase();
  const interval = Math.max(1, Number(r.INTERVAL) || 1);
  const count = r.COUNT ? Number(r.COUNT) : Infinity;
  const until = r.UNTIL ? parseDT(r.UNTIL.replace(/[Zz]$/, ''), {})?.date : undefined;
  const byday = (r.BYDAY ? r.BYDAY.split(',') : [])
    .map((s) => s.trim().match(/^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/i))
    .filter((x): x is RegExpMatchArray => !!x)
    .map((x) => ({ n: x[1] ? Number(x[1]) : 0, d: DOW.indexOf(x[2].toUpperCase()) }));
  const bymonthday = (r.BYMONTHDAY ? r.BYMONTHDAY.split(',') : []).map(Number).filter((n) => Number.isFinite(n) && n !== 0);
  const bymonth = (r.BYMONTH ? r.BYMONTH.split(',') : []).map(Number).filter((n) => n >= 1 && n <= 12);

  const out: string[] = [];
  const seen = new Set<string>();
  let produced = 0;
  let stop = false;
  const emit = (d: string) => {
    if (stop || seen.has(d) || d < start) return;
    if ((until && d > until) || d > toStr) {
      stop = true;
      return;
    }
    seen.add(d);
    produced++;
    if (d >= fromStr && !exdates.has(d)) out.push(d);
    if (produced >= count) stop = true;
  };
  const [sy, sm, sd] = start.split('-').map(Number);
  emit(start); // 先頭は、いつも1回目

  // 月の中の候補日（BYMONTHDAY → 第n曜日・曜日 → 開始日と同じ日）
  const monthDays = (y: number, m: number): number[] => {
    const last = daysInMonth(y, m);
    const days = new Set<number>();
    if (bymonthday.length) bymonthday.forEach((n) => { const d = n > 0 ? n : last + n + 1; if (d >= 1 && d <= last) days.add(d); });
    else if (byday.length) {
      byday.forEach(({ n, d }) => {
        if (n !== 0) { const day = nthWeekday(y, m, n, d); if (day) days.add(day); }
        else for (let day = 1; day <= last; day++) if (new Date(Date.UTC(y, m - 1, day)).getUTCDay() === d) days.add(day);
      });
    } else if (sd <= last) days.add(sd);
    return [...days].sort((a, b) => a - b);
  };

  for (let k = 0; k < 6000 && !stop; k++) {
    if (freq === 'DAILY') {
      const d = addDaysStr(start, k * interval);
      if (!byday.length || byday.some((b) => b.d === dowOf(d))) emit(d);
      if (d > toStr) break;
    } else if (freq === 'WEEKLY') {
      const monday = addDaysStr(start, -((dowOf(start) + 6) % 7));
      const wk = addDaysStr(monday, k * interval * 7);
      const days = (byday.length ? byday.map((b) => b.d) : [dowOf(start)]).sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
      for (const wd of days) emit(addDaysStr(wk, (wd + 6) % 7));
      if (wk > toStr) break;
    } else if (freq === 'MONTHLY') {
      const idx = sy * 12 + (sm - 1) + k * interval;
      const y = Math.floor(idx / 12);
      const m = (idx % 12) + 1;
      for (const d of monthDays(y, m)) emit(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
      if (`${y}-${String(m).padStart(2, '0')}-01` > toStr) break;
    } else if (freq === 'YEARLY') {
      const y = sy + k * interval;
      for (const m of bymonth.length ? bymonth : [sm]) for (const d of monthDays(y, m)) emit(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
      if (`${y}-01-01` > toStr) break;
    } else break; // 知らない繰り返し：先頭の1回だけ
  }
  // 追加の日（RDATE）は、繰り返しの回数（COUNT）とは別に足す
  for (const d of rdates) if (d >= fromStr && d <= toStr && !exdates.has(d) && !seen.has(d)) out.push(d);
  return out.sort();
}

// ---- 振り分け ----
// ひらがな・カタカナ・全角半角・大文字小文字の違いを同じものとして比べる
const norm = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

// 予定の題名・内容・参加者の中に、家族の名前（または設定した別名）があれば、その人に振り分ける
export function pickMembers(text: string, members: Member[], aliases: Record<string, string[]>): string[] {
  const hay = norm(text);
  return members
    .filter((m) => [m.name, ...(aliases[m.id] ?? [])].map(norm).filter(Boolean).some((n) => hay.includes(n)))
    .map((m) => m.id);
}

// ---- 本体 ----
export interface ParseOptions {
  rangeYears?: { back: number; forward: number };
  aliases?: Record<string, string[]>;
}

export function parseIcsReport(text: string, members: Member[], opts: ParseOptions = {}): IcsReport {
  const rangeYears = opts.rangeYears ?? { back: 1, forward: 2 };
  const aliases = opts.aliases ?? loadAliases(members);

  // 予定（VEVENT）を取り出す。中の「通知（VALARM）」など、入れ子の部分の項目は、予定の項目として数えない
  const vevents: RawVEvent[] = [];
  let cur: RawVEvent | null = null;
  let nested = 0;
  for (const line of unfold(text)) {
    const up = line.trim().toUpperCase();
    if (up === 'BEGIN:VEVENT') {
      cur = { props: [] };
      nested = 0;
    } else if (up === 'END:VEVENT') {
      if (cur) vevents.push(cur);
      cur = null;
    } else if (cur && up.startsWith('BEGIN:')) nested++;
    else if (cur && up.startsWith('END:')) nested = Math.max(0, nested - 1);
    else if (cur && nested === 0) {
      const p = parseProp(line);
      if (p) cur.props.push(p);
    }
  }

  const now = new Date();
  const from = new Date(now.getFullYear() - rangeYears.back, now.getMonth(), 1);
  const to = new Date(now.getFullYear() + rangeYears.forward, now.getMonth() + 1, 0);
  const fromStr = formatDate(from);
  const toStr = formatDate(to);

  const getter = (ev: RawVEvent) => ({
    get: (n: string) => ev.props.find((p) => p.name === n),
    all: (n: string) => ev.props.filter((p) => p.name === n),
  });

  // 「この回だけ変更・移動」された回（RECURRENCE-ID）を先に集める：元の繰り返しの、その回を出さないため
  const overridden = new Set<string>();
  vevents.forEach((ev) => {
    const { get } = getter(ev);
    const rid = get('RECURRENCE-ID');
    const uid = get('UID')?.value;
    const dt = rid ? parseDT(rid.value, rid.params) : null;
    if (rid && uid && dt) overridden.add(`${uid}|${dt.date}`);
  });

  const drafts: IcsDraft[] = [];
  const skipped: IcsSkipped[] = [];

  vevents.forEach((ev, i) => {
    const { get, all } = getter(ev);
    const title = unescapeText(get('SUMMARY')?.value ?? '').trim() || '（題名なし）';
    const skip = (reason: string, date?: string) => skipped.push({ title, date, reason });

    if ((get('STATUS')?.value ?? '').trim().toUpperCase() === 'CANCELLED') return skip('取り消し済みの予定');
    const s = get('DTSTART');
    if (!s) return skip('開始の日時が書かれていない');
    const start = parseDT(s.value, s.params);
    if (!start) return skip(`開始の日時の書き方が読めない（${s.value.slice(0, 30)}）`);

    const desc = unescapeText(get('DESCRIPTION')?.value ?? '').trim();
    const loc = unescapeText(get('LOCATION')?.value ?? '').trim();
    const who = [...all('ATTENDEE'), ...all('ORGANIZER')].map((p) => `${p.params.CN ?? ''} ${p.value}`).join(' ');
    const baseUid = get('UID')?.value ?? `noid-${i}`;
    const note = [loc && `場所: ${loc}`, desc].filter(Boolean).join('\n') || undefined;
    const ids = pickMembers(`${title}\n${desc}\n${who}`, members, aliases);

    // 終わり：DTEND、なければ DURATION、どちらもなければ（終日は1日、時刻つきは開始と同じ）
    let end: DT | null = null;
    const e = get('DTEND');
    if (e) end = parseDT(e.value, e.params);
    else {
      const dur = get('DURATION');
      const ms = dur ? parseDuration(dur.value) : null;
      if (ms !== null) {
        if (start.allDay) end = { date: addDaysStr(start.date, Math.max(1, Math.round(ms / MS_DAY))), allDay: true, ms: start.ms + ms };
        else {
          const dt = new Date(start.ms + ms);
          end = { date: formatDate(dt), time: `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`, allDay: false, ms: start.ms + ms };
        }
      }
    }

    // 何日またぐか・終わりの時刻
    let spanDays = 0;
    let endTime: string | undefined;
    if (end) {
      if (start.allDay) spanDays = Math.max(0, diffDays(start.date, end.date) - 1); // 終日予定の DTEND は「その前日まで」
      else if (end.ms > start.ms) {
        const midnight = end.time === '00:00' && end.date > start.date;
        const lastDate = midnight ? addDaysStr(end.date, -1) : end.date; // ちょうど 0:00 に終わるものは、前の日の終わり
        spanDays = Math.max(0, diffDays(start.date, lastDate));
        if (!midnight) endTime = end.time;
      }
    }

    // 「この回だけ変更・移動」の回：元の回の日付を、uid に入れて、二重にならないようにする
    const rid = get('RECURRENCE-ID');
    const ridDt = rid ? parseDT(rid.value, rid.params) : null;

    // 出す日の一覧
    let dates: string[];
    const rr = get('RRULE');
    if (rr && !ridDt) {
      const ex = new Set<string>();
      all('EXDATE').forEach((p) => p.value.split(',').forEach((v) => { const d = parseDT(v, p.params); if (d) ex.add(d.date); }));
      overridden.forEach((k) => { const [u, d] = k.split('|'); if (u === baseUid) ex.add(d); });
      const rdates: string[] = [];
      all('RDATE').forEach((p) => p.value.split(',').forEach((v) => { const d = parseDT(v, p.params); if (d) rdates.push(d.date); }));
      dates = expandRrule(rr.value, start.date, ex, rdates, fromStr, toStr);
      if (dates.length === 0) return skip('繰り返しの予定で、取り込む期間の中に該当する日がない', start.date);
    } else {
      if (start.date < fromStr || start.date > toStr) return skip(`取り込む期間（${fromStr.slice(0, 7)}〜${toStr.slice(0, 7)}）の外`, start.date);
      dates = [start.date];
    }

    dates.forEach((date) => {
      const uid = rr && !ridDt ? `${baseUid}@${date}` : ridDt ? `${baseUid}@${ridDt.date}` : baseUid;
      drafts.push({
        key: `${uid}#${date}`,
        uid,
        title,
        date,
        endDate: spanDays > 0 ? addDaysStr(date, spanDays) : undefined,
        startTime: start.allDay ? undefined : start.time,
        endTime: start.allDay ? undefined : endTime,
        allDay: start.allDay,
        note,
        memberIds: ids,
        matched: ids.length > 0,
      });
    });
  });

  drafts.sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? ''));
  return { drafts, skipped, totalEvents: vevents.length, rangeFrom: fromStr, rangeTo: toStr };
}

/** 従来の呼び方（予定の一覧だけ返す）。自動同期（iCal URL）などが使う */
export function parseIcs(text: string, members: Member[], rangeYears = { back: 1, forward: 2 }): IcsDraft[] {
  return parseIcsReport(text, members, { rangeYears }).drafts;
}

export function draftToEvent(d: IcsDraft, id: string): FamilyEvent {
  return {
    id,
    title: d.title,
    date: d.date,
    endDate: d.endDate,
    startTime: d.startTime,
    endTime: d.endTime,
    allDay: d.allDay,
    memberIds: d.memberIds,
    kind: 'event',
    note: d.note,
    source: 'ics',
    uid: d.uid,
  };
}
