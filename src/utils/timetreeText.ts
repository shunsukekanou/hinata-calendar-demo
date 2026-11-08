// TimeTree の画面から取り出した文字（timetreeExtract.ts の出力）を、取り込み用の予定に直す
//
// 1行1予定のタブ区切り：開始日 / 終了日 / 時刻（なければ空）/ 題名 / 色（#rrggbb、なくてもよい）
// 「#」で始まる行は、見出し・注意（予定ではない）
import type { Member } from '../types';
import { loadAliases } from './settings';
import { pickMembers } from './ics';
import type { IcsDraft, IcsReport, IcsSkipped } from './ics';

// TimeTree の色（ラベル）と、だれの予定かの対応（ひなた家の運用：青＝たかし、緑＝みさき、オレンジ＝あおい、紫＝りく）
//   色の値は、TimeTree の画面から実際に読み取ったもの。
const LABEL_COLORS: { id: string; rgb: [number, number, number] }[] = [
  { id: 'father', rgb: [3, 140, 208] },
  { id: 'mother', rgb: [6, 163, 116] },
  { id: 'daughter', rgb: [243, 162, 0] },
  { id: 'son', rgb: [137, 93, 190] },
];
// TimeTree が自動で入れる祝日の色。このアプリにも祝日があるので、初めは取り込まない（チェックを外しておく）
const HOLIDAY_RGB: [number, number, number] = [197, 3, 26];

const hexToRgb = (hex: string): [number, number, number] | null => {
  const m = hex.trim().match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
};
const near = (a: [number, number, number], b: [number, number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 40;

// 誕生日の予定は、色や名前にかかわらず「全員」の予定にする（ひなた家の運用）
const BIRTHDAY_RE = /🎂|誕生日|birthday|バースデー|ばーすでー/i;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{1,2}:\d{2}$/;

/** 取り出した文字か（貼り付けた文字が、この形式かの判定） */
export const isTimeTreeText = (text: string) => /^\s*#TimeTree-month-v1\t/.test(text);

export interface TimeTreeReport extends IcsReport {
  notes: string[]; // 画面からの注意（省略された予定があった、など）
  month: string; // 読み取った月（YYYY-MM）
}

export function parseTimeTreeText(text: string, members: Member[], opts: { aliases?: Record<string, string[]> } = {}): TimeTreeReport {
  const aliases = opts.aliases ?? loadAliases(members);
  const drafts: IcsDraft[] = [];
  const skipped: IcsSkipped[] = [];
  const notes: string[] = [];
  let month = '';
  let total = 0;
  const seen = new Map<string, number>(); // 同じ日・同じ題名・同じ時刻の予定が2つあるときの見分け用

  for (const raw of text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) continue;
    const cols = line.split('\t');
    if (line.startsWith('#')) {
      if (cols[0] === '#TimeTree-month-v1') month = cols[1] ?? '';
      else if (cols[0] === '#エラー') notes.push(cols[1] ?? 'うまく読み取れませんでした。');
      else if (cols[0] === '#注意') notes.push(`省略されて見えない予定があります：${cols[1] ?? ''}`);
      continue;
    }
    total++;
    const [date = '', endRaw = '', time = '', titleRaw = '', colorRaw = ''] = cols;
    const title = titleRaw.trim();
    if (!DATE_RE.test(date) || !title) {
      skipped.push({ title: title || line.slice(0, 40), date: date || undefined, reason: '日付か題名が読み取れませんでした' });
      continue;
    }
    const end = DATE_RE.test(endRaw) && endRaw > date ? endRaw : undefined;
    const startTime = TIME_RE.test(time) ? time.padStart(5, '0') : undefined;
    const base = `tt:${date}:${startTime ?? ''}:${title}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    // だれの予定か：誕生日なら全員。そうでなければ、色（ラベル）を優先。なければ、題名の中の名前・別名（パパ・ママなど）
    const rgb = hexToRgb(colorRaw);
    const byColor = rgb ? LABEL_COLORS.find((c) => near(rgb, c.rgb) && members.some((m) => m.id === c.id))?.id : undefined;
    const ids = BIRTHDAY_RE.test(title) ? [] : byColor ? [byColor] : pickMembers(title, members, aliases);
    const holiday = !!rgb && near(rgb, HOLIDAY_RGB);
    drafts.push({
      key: `${base}#${n}`,
      title,
      date,
      endDate: end,
      startTime,
      allDay: !startTime,
      uid: n === 1 ? base : `${base}#${n}`,
      memberIds: ids,
      matched: ids.length > 0,
      skip: holiday || undefined,
    });
  }
  drafts.sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? ''));
  const dates = drafts.map((d) => d.date);
  return {
    drafts,
    skipped,
    totalEvents: total,
    rangeFrom: dates[0] ?? '',
    rangeTo: dates[dates.length - 1] ?? '',
    notes,
    month,
  };
}
