// アプリの設定（この端末の中だけに保存。端末ごとに好みを変えられる）
//
//   startMonth：アプリを開いたとき（再読み込みも含む）に、どの月から見せるか
//     'today' ＝ いつも今月（今日）から開く（初期値）
//     'keep'  ＝ 閉じる前に見ていた月のまま開く（これまでの動き）
//   weekStart：カレンダーの週の始まり。'sun' ＝ 日曜日はじまり（初期値）／'mon' ＝ 月曜日はじまり
//   aliases ：取り込み（.ics など）で、予定を「だれの予定か」に振り分けるときに使う別名。
//             人の id ごとに、カンマ区切りの文字（例：たかし, taka）
import type { Member } from '../types';

export type StartMonth = 'today' | 'keep';
export type WeekStart = 'sun' | 'mon';

export interface AppSettings {
  startMonth: StartMonth;
  weekStart: WeekStart;
  aliases: Record<string, string>;
}

const KEY = 'hinata_settings_v1';
// 初めから入れてある別名（⚙️設定で、書き換え・空にもできる）。「パパの予定はたかし」「ママの予定はみさき」
const DEFAULT_ALIASES: Record<string, string> = { father: 'パパ', mother: 'ママ' };
const DEFAULTS: AppSettings = { startMonth: 'today', weekStart: 'sun', aliases: { ...DEFAULT_ALIASES } };

export function loadSettings(): AppSettings {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
    if (raw) {
      const j = JSON.parse(raw) as Partial<AppSettings>;
      return {
        startMonth: j.startMonth === 'keep' ? 'keep' : 'today',
        weekStart: j.weekStart === 'mon' ? 'mon' : 'sun',
        aliases: { ...DEFAULT_ALIASES, ...(j.aliases && typeof j.aliases === 'object' ? (j.aliases as Record<string, string>) : {}) },
      };
    }
  } catch {
    // 読めなければ初期値
  }
  return { ...DEFAULTS, aliases: { ...DEFAULT_ALIASES } };
}

export function saveSettings(next: AppSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 保存できなくても、今回の画面では使える
  }
}

/** 人ごとの別名（カンマ・読点・改行で区切る）。空の項目は除く */
export function loadAliases(members: Member[]): Record<string, string[]> {
  const a = loadSettings().aliases;
  const out: Record<string, string[]> = {};
  for (const m of members) {
    out[m.id] = String(a[m.id] ?? '')
      .split(/[,、，\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return out;
}
