// ひなた家カレンダーの型

export interface Member {
  id: string;
  name: string;
  color: string; // 濃い色（文字・枠）
  soft: string; // 薄い色（背景）
}

// kind: 'event' = ふつうの予定 / 'off' = お休み（たかしの会社休みなど）
export interface FamilyEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD（開始日）
  endDate?: string; // YYYY-MM-DD（複数日の予定の最終日）
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
  allDay: boolean;
  memberIds: string[]; // 空 = 家族全員
  kind: 'event' | 'off';
  note?: string;
  source?: 'manual' | 'ics' | 'image' | 'google';
  uid?: string; // .ics の UID（同じファイルを取り込み直したときの重複防止）
  repeat?: 'yearly'; // 毎年繰り返す（誕生日・記念日など）。元の日にち（date）の月日で、毎年その日に出る
  reminders?: string[]; // 通知（リマインド）。m30＝30分前、a8＝当日の朝8時 など（utils/reminders.ts）
  sourceName?: string; // 自動同期した予定の、元のカレンダー名（例：たかしのGoogleカレンダー）。画面に🏷️で表示する
}

export type ViewMode = 'month' | 'people' | 'list';
