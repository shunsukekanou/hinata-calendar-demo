// 毎年繰り返す予定（誕生日・記念日など）の判定。
//
// 予定は、元の日にち（date）の1件だけを保存する。「毎年」はここで、見ている年に広げて判定する。
//   ・元の年より前には出さない（例：2026年に作った予定は、2025年には出ない）
//   ・2月29日の予定は、うるう年でない年は2月28日に出す
//   ・何日間かの予定（最終日あり）は、その日数のまま毎年出す。年をまたぐもの（12/30〜1/2）も扱える
//   ・「第3日曜日」「隔週」のような複雑な繰り返しはしない（月日が同じ日だけ）
import type { FamilyEvent } from '../types';

const MS_DAY = 86400000;
const utc = (d: string) => {
  const [y, m, dd] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, dd);
};
const fmt = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

export const daysBetween = (from: string, to: string) => Math.round((utc(to) - utc(from)) / MS_DAY);
export const addDaysStr = (d: string, n: number) => fmt(utc(d) + n * MS_DAY);
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** 毎年の予定が、y 年に始まる日（2月29日は、うるう年でなければ2月28日） */
export function yearlyStart(baseDate: string, y: number): string {
  const [, m, d] = baseDate.split('-');
  if (m === '02' && d === '29' && !isLeap(y)) return `${y}-02-28`;
  return `${y}-${m}-${d}`;
}

/** 毎年繰り返しにできる長さ（これ以上の長い予定は、年をまたいで重なるのでできない） */
export const MAX_YEARLY_SPAN_DAYS = 364;

/** その予定は、date（YYYY-MM-DD）の日に出るか。毎年繰り返しも、ふつうの予定（最終日まで）も扱う */
export function occursOn(e: FamilyEvent, date: string): boolean {
  const end = e.endDate || e.date;
  if (e.repeat !== 'yearly') return e.date <= date && date <= end;
  if (date < e.date) return false;
  const span = Math.min(Math.max(daysBetween(e.date, end), 0), MAX_YEARLY_SPAN_DAYS);
  const qy = Number(date.slice(0, 4));
  const by = Number(e.date.slice(0, 4));
  // その年に始まったものと、前の年に始まって年をまたいで続いているもの
  for (let y = qy; y >= qy - 1 && y >= by; y--) {
    const start = yearlyStart(e.date, y);
    if (start < e.date) continue;
    if (start <= date && date <= addDaysStr(start, span)) return true;
  }
  return false;
}
