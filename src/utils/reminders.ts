// 予定の「通知（リマインド）」の設定
//
// 1件の通知を、短い文字（トークン）で表す。予定には、これを複数つけられる。
//   m<分>  ：始まりの何分前か（m0 ＝ 始まりの時刻、m30 ＝ 30分前、m1440 ＝ 1日前）
//            ※終日の予定は、その日の 0:00 が「始まり」
//   a<時>  ：当日の、その時刻（a8 ＝ 当日の朝 8:00）
//   b<時>  ：前日の、その時刻（b20 ＝ 前日の 20:00）
//   w<時>  ：1週間前の、その時刻（w8 ＝ 1週間前の 8:00）
// 選び方は、LINE WORKS のカレンダーの通知（5分前・10分前…1週間前・直接入力）に合わせてある。
// 通知を出す時刻の計算（reminderFireAt）は、サーバー側（api/）の配信でも同じ考え方を使う。
import type { FamilyEvent } from '../types';

export interface ReminderOption {
  token: string;
  label: string;
}

const TIMED: ReminderOption[] = [
  { token: 'm0', label: '開始時刻' },
  { token: 'm5', label: '5分前' },
  { token: 'm10', label: '10分前' },
  { token: 'm15', label: '15分前' },
  { token: 'm30', label: '30分前' },
  { token: 'm60', label: '1時間前' },
  { token: 'm120', label: '2時間前' },
  { token: 'm180', label: '3時間前' },
  { token: 'm720', label: '12時間前' },
  { token: 'm1440', label: '1日前' },
  { token: 'm2880', label: '2日前' },
  { token: 'm10080', label: '1週間前' },
  { token: 'a7', label: '当日の朝 7:00' },
  { token: 'a8', label: '当日の朝 8:00' },
  { token: 'a9', label: '当日の朝 9:00' },
  { token: 'b20', label: '前日の夜 20:00' },
];

// 終日の予定（誕生日など）は、時刻ではなく「何時に知らせるか」で選ぶ
const ALL_DAY: ReminderOption[] = [
  { token: 'a7', label: '当日の朝 7:00' },
  { token: 'a8', label: '当日の朝 8:00' },
  { token: 'a9', label: '当日の朝 9:00' },
  { token: 'b8', label: '前日の朝 8:00' },
  { token: 'b20', label: '前日の夜 20:00' },
  { token: 'w8', label: '1週間前の朝 8:00' },
];

export const reminderOptions = (allDay: boolean): ReminderOption[] => (allDay ? ALL_DAY : TIMED);

/** 新しい予定に、初めからつけておく通知（時刻つき：30分前／終日：当日の朝 8:00） */
export const defaultReminders = (allDay: boolean): string[] => (allDay ? ['a8'] : ['m30']);

const TOKEN_RE = /^(?:m\d{1,5}|[abw](?:[01]?\d|2[0-3]))$/;
export const isReminderToken = (t: string) => TOKEN_RE.test(t);

/** 画面に出す名前（一覧にない「直接入力」の分数も読める形にする） */
export function reminderLabel(token: string): string {
  const all = [...TIMED, ...ALL_DAY].find((o) => o.token === token);
  if (all) return all.label;
  const m = token.match(/^m(\d+)$/);
  if (m) {
    const n = +m[1];
    if (n % 1440 === 0) return `${n / 1440}日前`;
    if (n % 60 === 0) return `${n / 60}時間前`;
    return `${n}分前`;
  }
  const h = token.slice(1);
  return token[0] === 'a' ? `当日の朝 ${h}:00` : token[0] === 'b' ? `前日の ${h}:00` : `1週間前の ${h}:00`;
}

/** 直接入力（数と単位）から、通知のトークンを作る。使えない値なら null */
export function customToken(n: number, unit: 'min' | 'hour' | 'day'): string | null {
  if (!Number.isInteger(n) || n < 1) return null;
  const minutes = n * (unit === 'min' ? 1 : unit === 'hour' ? 60 : 1440);
  return minutes <= 60 * 24 * 60 ? `m${minutes}` : null; // 最大60日前
}

/** 通知を出す時刻（日本時間の壁時計で、ミリ秒の値。サーバーと同じ計算）。date は YYYY-MM-DD */
export function reminderFireAt(token: string, date: string, startTime?: string): number | null {
  if (!isReminderToken(token)) return null;
  const [y, mo, d] = date.split('-').map(Number);
  const dayStart = Date.UTC(y, mo - 1, d); // その日の 0:00（日本時間の壁時計を、UTC の数として扱う）
  const kind = token[0];
  if (kind === 'm') {
    const [hh, mm] = (startTime ?? '00:00').split(':').map(Number);
    return dayStart + (hh * 60 + mm) * 60000 - Number(token.slice(1)) * 60000;
  }
  const hour = Number(token.slice(1));
  const back = kind === 'a' ? 0 : kind === 'b' ? 1 : 7;
  return dayStart - back * 86400000 + hour * 3600000;
}

export const normalizeReminders = (list: unknown): string[] | undefined => {
  if (!Array.isArray(list)) return undefined;
  const out = [...new Set(list.filter((t): t is string => typeof t === 'string' && isReminderToken(t)))];
  return out.length ? out : undefined;
};

export const remindersOf = (e: Pick<FamilyEvent, 'reminders'>): string[] => e.reminders ?? [];
