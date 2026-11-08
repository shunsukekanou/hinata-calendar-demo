
/**
 * 日本の祝日を計算する関数 (2020年〜2030年対応)
 */
export function getJapaneseHolidays(year: number): Record<string, string> {
  const holidays: Record<string, string> = {};

  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const setHoliday = (month: number, day: number, name: string) => {
    holidays[`${year}-${pad(month)}-${pad(day)}`] = name;
  };

  // 1月
  setHoliday(1, 1, '元日');
  // 成人の日 (第2月曜日)
  const adultDay = getNthDayOfWeek(year, 1, 1, 2);
  setHoliday(1, adultDay, '成人の日');

  // 2月
  setHoliday(2, 11, '建国記念の日');
  setHoliday(2, 23, '天皇誕生日');

  // 3月 (春分の日: 概ね3/20または3/21)
  const vernalEquinox = Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  setHoliday(3, vernalEquinox, '春分の日');

  // 4月
  setHoliday(4, 29, '昭和の日');

  // 5月
  setHoliday(5, 3, '憲法記念日');
  setHoliday(5, 4, 'みどりの日');
  setHoliday(5, 5, 'こどもの日');

  // 7月 海の日 (第3月曜日)
  const oceanDay = getNthDayOfWeek(year, 7, 1, 3);
  setHoliday(7, oceanDay, '海の日');

  // 8月 山の日
  setHoliday(8, 11, '山の日');

  // 9月 敬老の日 (第3月曜日)
  const respectDay = getNthDayOfWeek(year, 9, 1, 3);
  setHoliday(9, respectDay, '敬老の日');

  // 9月 秋分の日
  const autumnEquinox = Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  setHoliday(9, autumnEquinox, '秋分の日');

  // 国民の休日 (敬老の日と秋分の日に挟まれた日)
  if (autumnEquinox - respectDay === 2) {
    setHoliday(9, respectDay + 1, '国民の休日');
  }

  // 10月 スポーツの日 (第2月曜日)
  const sportsDay = getNthDayOfWeek(year, 10, 1, 2);
  setHoliday(10, sportsDay, 'スポーツの日');

  // 11月
  setHoliday(11, 3, '文化の日');
  setHoliday(11, 23, '勤労感謝の日');

  // 振替休日 (日曜日に祝日が重なった場合、翌平日が振替休日)
  const sortedDates = Object.keys(holidays).sort();
  for (const dateStr of sortedDates) {
    const d = new Date(`${dateStr}T00:00:00`);
    if (d.getDay() === 0) { // 日曜日
      let nextDate = new Date(d);
      while (true) {
        nextDate.setDate(nextDate.getDate() + 1);
        const nextStr = `${nextDate.getFullYear()}-${pad(nextDate.getMonth() + 1)}-${pad(nextDate.getDate())}`;
        if (!holidays[nextStr]) {
          holidays[nextStr] = '振替休日';
          break;
        }
      }
    }
  }

  return holidays;
}

/**
 * 特定月の第N番目の指定曜日（0:日, 1:月, ... 6:土）の日付を返す
 */
function getNthDayOfWeek(year: number, month: number, dayOfWeek: number, nth: number): number {
  let count = 0;
  for (let day = 1; day <= 31; day++) {
    const d = new Date(year, month - 1, day);
    if (d.getMonth() !== month - 1) break;
    if (d.getDay() === dayOfWeek) {
      count++;
      if (count === nth) {
        return day;
      }
    }
  }
  return 1;
}

/**
 * 曜日の日本語表記
 */
export const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];

/** 週の始まり（0＝日曜日、1＝月曜日）に合わせた、曜日の並び。各項目の dow は、本当の曜日（日曜日が 0） */
export function weekdayHeaders(weekStart: 0 | 1 = 0): { label: string; dow: number }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const dow = (i + weekStart) % 7;
    return { label: WEEKDAYS_JA[dow], dow };
  });
}
export const WEEKDAYS_FULL_JA = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];

/**
 * YYYY-MM-DD 文字列を取得
 */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 日本語フォーマット (例: 2026年10月5日(月))
 */
export function formatDateJapanese(dateStr: string, withWeekday = true): string {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const w = WEEKDAYS_JA[d.getDay()];
  return withWeekday ? `${y}年${m}月${day}日(${w})` : `${y}年${m}月${day}日`;
}

/**
 * カレンダーグリッドの日付リストを取得（前月・翌月の日付埋め込み）
 */
export interface CalendarGridCell {
  dateStr: string;
  day: number;
  month: number;
  year: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  dayOfWeek: number; // 0 (Sun) - 6 (Sat)
  holidayName?: string;
}

/** weekStart：週の始まり（0＝日曜日、1＝月曜日） */
export function generateCalendarGrid(year: number, month: number, weekStart: 0 | 1 = 0): CalendarGridCell[] {
  const holidays = getJapaneseHolidays(year);
  const todayStr = formatDate(new Date());

  const firstDayOfMonth = new Date(year, month - 1, 1);
  const lastDayOfMonth = new Date(year, month, 0);

  const startDayOfWeek = (firstDayOfMonth.getDay() - weekStart + 7) % 7; // その月の1日が、週の何番目の列か（0〜6）
  const totalDaysInMonth = lastDayOfMonth.getDate();

  const cells: CalendarGridCell[] = [];

  // 前月の日付埋め
  const prevMonthLastDay = new Date(year, month - 1, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const day = prevMonthLastDay - i;
    const prevDate = new Date(year, month - 2, day);
    const dateStr = formatDate(prevDate);
    cells.push({
      dateStr,
      day,
      month: prevDate.getMonth() + 1,
      year: prevDate.getFullYear(),
      isCurrentMonth: false,
      isToday: dateStr === todayStr,
      dayOfWeek: prevDate.getDay(),
      holidayName: holidays[dateStr],
    });
  }

  // 当月の日付
  for (let day = 1; day <= totalDaysInMonth; day++) {
    const currDate = new Date(year, month - 1, day);
    const dateStr = formatDate(currDate);
    cells.push({
      dateStr,
      day,
      month,
      year,
      isCurrentMonth: true,
      isToday: dateStr === todayStr,
      dayOfWeek: currDate.getDay(),
      holidayName: holidays[dateStr],
    });
  }

  // 翌月の日付埋め (6週間 = 42マス)
  const remaining = 42 - cells.length;
  for (let day = 1; day <= remaining; day++) {
    const nextDate = new Date(year, month, day);
    const dateStr = formatDate(nextDate);
    cells.push({
      dateStr,
      day,
      month: nextDate.getMonth() + 1,
      year: nextDate.getFullYear(),
      isCurrentMonth: false,
      isToday: dateStr === todayStr,
      dayOfWeek: nextDate.getDay(),
      holidayName: holidays[dateStr],
    });
  }

  return cells;
}
