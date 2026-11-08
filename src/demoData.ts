// デモ版の予定データ（すべて架空。実在の家族・学校・団体とは関係ありません）
//
// ・日付は「今日の月」を基準に作るので、いつ開いても、今月と前後の月に予定が並ぶ。
// ・初めから入れておく予定（家族の行事・仕事・学校）と、
//   「サンプル予定の取り込み」で入れられる見本（部活・習い事・PTA/自治会）に分けてある。
// ・見本は uid が決まっているので、何度取り込んでも、同じ予定が重ならない。
import type { FamilyEvent } from './types';

type Draft = Omit<FamilyEvent, 'id'>;

export const FATHER = 'father'; // たかし
export const MOTHER = 'mother'; // みさき
export const DAUGHTER = 'daughter'; // あおい（長女・中学生）
export const SON = 'son'; // りく（長男・小学生）

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => {
  const dt = new Date(y, m - 1, d); // 月をまたぐ数え方（32日など）もここで直る
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
};

/** その月の第 n 回目の weekday（0＝日曜…6＝土曜）の日 */
const nthWeekday = (y: number, m: number, weekday: number, n: number) => {
  const first = new Date(y, m - 1, 1).getDay();
  return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
};

/** 前の月の1日から、2か月先の月末までの、毎週 weekday の日付 */
function weeklyDates(today: Date, weekday: number): string[] {
  const out: string[] = [];
  const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 3, 0);
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === weekday) out.push(ymd(d.getFullYear(), d.getMonth() + 1, d.getDate()));
  }
  return out;
}

/** 前の月から2か月先までの、毎月の（y, m）の一覧 */
function months(today: Date): { y: number; m: number }[] {
  const out: { y: number; m: number }[] = [];
  for (let k = -1; k <= 2; k++) {
    const d = new Date(today.getFullYear(), today.getMonth() + k, 1);
    out.push({ y: d.getFullYear(), m: d.getMonth() + 1 });
  }
  return out;
}

const timed = (uid: string, title: string, date: string, startTime: string, endTime: string, memberIds: string[], sourceName: string, note?: string): Draft => ({
  title,
  date,
  startTime,
  endTime,
  allDay: false,
  memberIds,
  kind: 'event',
  source: 'ics',
  uid,
  sourceName,
  note,
});

const allDay = (uid: string, title: string, date: string, memberIds: string[], sourceName: string, endDate?: string, note?: string): Draft => ({
  title,
  date,
  endDate,
  allDay: true,
  memberIds,
  kind: 'event',
  source: 'ics',
  uid,
  sourceName,
  note,
});

// 今月のうち、まだ先の日にちを選ぶための補助（「今月の◯日」を、月ごとに作る）
const inMonth = (today: Date, day: number, add = 0) => {
  const d = new Date(today.getFullYear(), today.getMonth() + add, day);
  return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), s: ymd(d.getFullYear(), d.getMonth() + 1, d.getDate()) };
};

// ───────── 初めから入れておく予定 ─────────

/** 家族の行事（全員の予定） */
function familyEvents(today: Date): Draft[] {
  const out: Draft[] = [];
  // 誕生日（毎年）
  out.push({ title: 'りくの誕生日 🎂', date: '2018-11-20', allDay: true, memberIds: [], kind: 'event', source: 'manual', repeat: 'yearly', sourceName: '家族の行事' });
  out.push({ title: 'みさきの誕生日 🎂', date: '1990-06-02', allDay: true, memberIds: [], kind: 'event', source: 'manual', repeat: 'yearly', sourceName: '家族の行事' });
  out.push({ title: 'あおいの誕生日 🎂', date: '2012-03-14', allDay: true, memberIds: [], kind: 'event', source: 'manual', repeat: 'yearly', sourceName: '家族の行事' });
  out.push({ title: 'たかしの誕生日 🎂', date: '1988-09-09', allDay: true, memberIds: [], kind: 'event', source: 'manual', repeat: 'yearly', sourceName: '家族の行事' });
  // 月に1回の家族の外食（第1日曜の夜）
  for (const { y, m } of months(today)) {
    out.push(timed(`demo:family:dinner:${y}${pad(m)}`, '家族で外食 🍽️', ymd(y, m, nthWeekday(y, m, 0, 1)), '18:00', '20:00', [], '家族の行事'));
  }
  // この時期の行事（毎年同じ月日に入れてある）
  for (const yr of [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1]) {
    out.push(timed(`demo:family:753:${yr}`, 'りく 七五三の写真撮影 📸', `${yr}-11-15`, '10:00', '11:30', [], '家族の行事', '近所の写真館。神社のお参りもあわせて。'));
    out.push(allDay(`demo:family:cleaning:${yr}`, '家族で大掃除 🧹', `${yr}-12-27`, [], '家族の行事'));
    out.push(allDay(`demo:family:homecoming:${yr}`, '帰省（おじいちゃんの家へ）', `${yr}-12-29`, [], '家族の行事', `${yr + 1}-01-02`, '年末年始は、家族みんなで帰省。'));
  }
  return out;
}

/** 仕事（たかしの会社・みさきのパート） */
function workEvents(today: Date): Draft[] {
  const out: Draft[] = [];
  // みさき：パートのシフト（毎週 火・金）
  for (const wd of [2, 5]) {
    for (const date of weeklyDates(today, wd)) {
      out.push(timed(`demo:work:part:${date}`, 'パート', date, '09:00', '14:00', [MOTHER], 'パート先のシフト表'));
    }
  }
  // たかし：会社の予定と休み
  for (const { y, m } of months(today)) {
    out.push(timed(`demo:work:meeting:${y}${pad(m)}`, '部門会議', ymd(y, m, nthWeekday(y, m, 1, 2)), '10:00', '11:30', [FATHER], '会社のカレンダー'));
    out.push({
      title: '有給休暇',
      date: ymd(y, m, nthWeekday(y, m, 5, 3)),
      allDay: true,
      memberIds: [FATHER],
      kind: 'off',
      source: 'manual',
      uid: `demo:work:off:${y}${pad(m)}`,
      sourceName: '会社のカレンダー',
    });
  }
  const t = inMonth(today, 11);
  out.push(allDay(`demo:work:trip:${t.s}`, '出張（大阪）', t.s, [FATHER], '会社のカレンダー', inMonth(today, 12).s));
  return out;
}

/** 学校（あおい・りく） */
function schoolEvents(today: Date): Draft[] {
  const out: Draft[] = [];
  const a = inMonth(today, 13);
  out.push(timed(`demo:school:visit:${a.s}`, '授業参観', a.s, '13:30', '15:00', [SON, MOTHER], 'りくの学校のおたより'));
  const b = inMonth(today, 26);
  out.push(timed(`demo:school:talk:${b.s}`, '個人面談', b.s, '15:30', '15:50', [DAUGHTER, MOTHER], 'あおいの学校のおたより'));
  const c = inMonth(today, 8, 1);
  out.push(allDay(`demo:school:exam:${c.s}`, '期末テスト', c.s, [DAUGHTER], 'あおいの学校のおたより', inMonth(today, 10, 1).s));
  for (const { y, m } of months(today)) {
    out.push(allDay(`demo:school:lunch:${y}${pad(m)}`, '給食なし（短縮授業）', ymd(y, m, nthWeekday(y, m, 3, 2)), [SON], 'りくの学校のおたより'));
  }
  return out;
}

/** 初めから入れておく予定（家族の行事・仕事・学校） */
export function baseEvents(today: Date = new Date()): Draft[] {
  return [...familyEvents(today), ...workEvents(today), ...schoolEvents(today)];
}

// ───────── 「サンプル予定の取り込み」で入れられる見本 ─────────

export interface SamplePack {
  id: string;
  icon: string;
  title: string; // 例：部活（TimeTree）
  who: string; // 例：あおい
  from: string; // どのアプリ・どこの予定か
  desc: string;
  events: Draft[];
}

/** 部活：あおいの吹奏楽部（TimeTree に入っている予定） */
function bandPack(today: Date): Draft[] {
  const out: Draft[] = [];
  const S = '吹奏楽部（TimeTree）';
  for (const date of weeklyDates(today, 6)) {
    out.push(timed(`demo:band:practice:${date}`, '吹奏楽部 練習', date, '09:00', '12:00', [DAUGHTER], S));
  }
  const concert = inMonth(today, 20, 1);
  const d = new Date(concert.y, concert.m - 1, concert.d);
  while (d.getDay() !== 0) d.setDate(d.getDate() + 1); // 翌月20日のあとの、最初の日曜日
  out.push(timed(`demo:band:concert`, '吹奏楽部 定期演奏会 🎺', ymd(d.getFullYear(), d.getMonth() + 1, d.getDate()), '13:00', '16:00', [DAUGHTER, MOTHER, FATHER], S, '家族みんなで聴きに行く。会場は市民ホール。'));
  for (const { y, m } of months(today)) {
    out.push(timed(`demo:band:parents:${y}${pad(m)}`, '吹奏楽部 保護者会', ymd(y, m, nthWeekday(y, m, 6, 4)), '14:00', '15:00', [MOTHER], S));
  }
  return out;
}

/** 習い事：りくのサッカー少年団とスイミング */
function lessonPack(today: Date): Draft[] {
  const out: Draft[] = [];
  for (const date of weeklyDates(today, 0)) {
    out.push(timed(`demo:soccer:practice:${date}`, 'サッカー 練習', date, '09:00', '11:30', [SON], 'サッカー少年団'));
  }
  for (const date of weeklyDates(today, 3)) {
    out.push(timed(`demo:swim:${date}`, 'スイミング', date, '17:00', '18:00', [SON], 'スイミング教室'));
  }
  for (const { y, m } of months(today)) {
    out.push(timed(`demo:soccer:match:${y}${pad(m)}`, 'サッカー 練習試合 ⚽', ymd(y, m, nthWeekday(y, m, 0, 3)), '08:30', '12:00', [SON, FATHER], 'サッカー少年団', 'お茶と水筒を忘れずに。'));
  }
  return out;
}

/** PTA・自治会：みさきのPTA、たかしの自治会 */
function communityPack(today: Date): Draft[] {
  const out: Draft[] = [];
  for (const { y, m } of months(today)) {
    out.push(timed(`demo:pta:board:${y}${pad(m)}`, 'PTA 役員会', ymd(y, m, nthWeekday(y, m, 4, 2)), '19:00', '20:30', [MOTHER], 'PTA'));
    out.push(timed(`demo:pta:recycle:${y}${pad(m)}`, 'PTA 資源回収', ymd(y, m, nthWeekday(y, m, 6, 3)), '08:00', '10:00', [MOTHER, FATHER], 'PTA'));
    out.push(timed(`demo:town:clean:${y}${pad(m)}`, '町内清掃', ymd(y, m, nthWeekday(y, m, 0, 1)), '08:00', '09:00', [FATHER], '自治会'));
  }
  const drill = inMonth(today, 22);
  out.push(timed(`demo:town:drill:${drill.s}`, '自治会 防災訓練', drill.s, '10:00', '12:00', [FATHER, SON], '自治会', '集合場所は公民館前。'));
  return out;
}

export function samplePacks(today: Date = new Date()): SamplePack[] {
  return [
    { id: 'band', icon: '🎺', title: '部活の予定', who: 'あおい', from: 'TimeTree', desc: '吹奏楽部の土曜練習・保護者会・定期演奏会', events: bandPack(today) },
    { id: 'lesson', icon: '⚽', title: '習い事の予定', who: 'りく', from: 'サッカー少年団・スイミング教室', desc: '日曜の練習、水曜のスイミング、毎月の練習試合', events: lessonPack(today) },
    { id: 'community', icon: '🏘️', title: 'PTA・自治会の予定', who: 'みさき・たかし', from: 'PTA・自治会', desc: '役員会、資源回収、町内清掃、防災訓練', events: communityPack(today) },
  ];
}
