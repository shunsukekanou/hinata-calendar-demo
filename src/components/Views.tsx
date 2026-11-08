import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ALL_COLOR, ALL_SOFT, appliesTo, eventsOn, memberLabel, timeLabel, useStore } from '../store';
import { formatDate, generateCalendarGrid, getJapaneseHolidays, weekdayHeaders, formatDateJapanese } from '../utils/holidayUtils';
import type { FamilyEvent, Member } from '../types';
import { monthKey, useMonthWindow } from '../utils/monthWindow';

export function eventColors(e: FamilyEvent, members: Member[]) {
  if (e.memberIds.length === 1) {
    const m = members.find((x) => x.id === e.memberIds[0]);
    if (m) return { color: m.color, soft: m.soft };
  }
  return { color: ALL_COLOR, soft: ALL_SOFT };
}

// 毎年繰り返す予定には、題名の前に 🔄 を付ける（小さな枠でも題名が読めるよう、印は小さく）
const Rep: React.FC<{ e: FamilyEvent }> = ({ e }) => (e.repeat === 'yearly' ? <span className="rep-mark" title="毎年繰り返す">🔄</span> : null);

const dowClass = (dow: number) => (dow === 0 ? 'sun' : dow === 6 ? 'sat' : '');

export const MonthNav: React.FC = () => {
  const { year, month, goNext, goPrev, goToday } = useStore();
  return (
    <div className="month-nav">
      <button className="icon-btn" onClick={goPrev} aria-label="前の月">
        <ChevronLeft size={22} />
      </button>
      <div className="month-title">
        {year}年 {month}月
      </div>
      <button className="icon-btn" onClick={goNext} aria-label="次の月">
        <ChevronRight size={22} />
      </button>
      <button className="today-btn" onClick={goToday}>
        今日
      </button>
    </div>
  );
};

// ---- 月間 ----
// 月カレンダーに出す人の選択（端末に覚えておく）。「全体」＋4人の5つのボタンが、それぞれ個別に ON／OFF できる。全部 ON が初期状態。
//   ・「全体」ボタン：だれの予定か決めていない予定（家族全体の予定）を出すかどうか
//   ・人のボタン：その人の予定を出すかどうか
const FILTER_KEY = 'hinata_month_filter_v2';
const OLD_FILTER_KEY = 'hinata_month_filter_v1'; // 以前の保存（人だけの一覧。全員の予定は、いつも出していた）
const ALL_ID = '__all';

function loadFilter(memberIds: string[]): string[] {
  const everything = [ALL_ID, ...memberIds];
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    if (raw) return (JSON.parse(raw) as string[]).filter((id) => everything.includes(id));
    const old = localStorage.getItem(OLD_FILTER_KEY);
    if (old) {
      const ids = (JSON.parse(old) as string[]).filter((id) => memberIds.includes(id));
      if (ids.length > 0) return [ALL_ID, ...ids];
    }
  } catch {
    // 読めなければ全部 ON
  }
  return everything;
}

// 選んだボタンの予定だけを残す。全員の予定（だれの予定か決めていないもの）は「全体」ボタンで出し入れする。
function passesFilter(e: FamilyEvent, selected: string[]): boolean {
  if (e.memberIds.length === 0) return selected.includes(ALL_ID);
  return e.memberIds.some((id) => selected.includes(id));
}

const MemberFilter: React.FC<{ selected: string[]; onChange: (ids: string[]) => void }> = ({ selected, onChange }) => {
  const { members } = useStore();
  const order = [ALL_ID, ...members.map((m) => m.id)];
  const toggle = (id: string) => onChange(order.filter((x) => (x === id ? !selected.includes(x) : selected.includes(x))));
  const items = [{ id: ALL_ID, name: '全体', color: ALL_COLOR }, ...members.map((m) => ({ id: m.id, name: m.name, color: m.color }))];
  return (
    <div className="member-filter no-print" role="group" aria-label="表示する人">
      {items.map((m) => {
        const on = selected.includes(m.id);
        return (
          <button key={m.id} className={`mf-btn ${on ? 'on' : ''}`} style={{ '--mf': m.color } as React.CSSProperties} aria-pressed={on} onClick={() => toggle(m.id)}>
            {m.name}
          </button>
        );
      })}
    </div>
  );
};

export const MonthView: React.FC = () => {
  const { year, month, events, members, openDaySheet, setSelectedDate, weekStart } = useStore();
  const [selected, setSelectedRaw] = useState<string[]>(() => loadFilter(members.map((m) => m.id)));
  const setSelected = (ids: string[]) => {
    setSelectedRaw(ids);
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify(ids));
    } catch {
      // 覚えられなくても表示はできる
    }
  };
  const cells = generateCalendarGrid(year, month, weekStart);
  return (
    <div className="month-view">
      <MemberFilter selected={selected} onChange={setSelected} />
      <div className="dow-row">
        {weekdayHeaders(weekStart).map((w) => (
          <div key={w.dow} className={`dow ${dowClass(w.dow)}`}>
            {w.label}
          </div>
        ))}
      </div>
      <div className="month-grid">
        {cells.map((c) => {
          const list = eventsOn(events, c.dateStr).filter((e) => passesFilter(e, selected));
          const off = list.some((e) => e.kind === 'off');
          const shown = list.slice(0, 3);
          return (
            <button
              key={c.dateStr}
              className={`day-cell ${c.isCurrentMonth ? '' : 'other'} ${c.isToday ? 'today' : ''} ${off ? 'has-off' : ''}`}
              onClick={() => {
                setSelectedDate(c.dateStr);
                openDaySheet(c.dateStr);
              }}
            >
              <span className={`day-num ${c.holidayName ? 'sun' : dowClass(c.dayOfWeek)}`}>{c.day}</span>
              {c.holidayName && <span className="holiday-name">{c.holidayName}</span>}
              <span className="chips">
                {shown.map((e) => {
                  const col = eventColors(e, members);
                  return (
                    <span key={e.id} className="chip" style={{ background: col.soft, borderLeftColor: col.color, color: '#3a2f27' }}>
                      <Rep e={e} />
                      {e.kind === 'off' ? `${memberLabel(e, members)}休` : e.title}
                    </span>
                  );
                })}
                {list.length > shown.length && <span className="more">+{list.length - shown.length}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ---- タイムライン（旧・人別）----
// 広い画面：行＝人、列＝日付（左右にスクロール）／ 狭い画面（スマホ縦）：行＝日付、列＝人（上下にスクロール）。
// どちらも、1日の中を 午前（AM・上）／午後（PM・下）に分ける。

// タイムラインの日付ヘッダーだけ、曜日を「㈪」の形で出す（月カレンダー・一覧は「月」のまま）。
const TL_WEEKDAYS = ['㈰', '㈪', '㈫', '㈬', '㈭', '㈮', '㈯']; // ㈰ ㈪ ㈫ ㈬ ㈭ ㈮ ㈯

const NARROW = '(max-width: 699px)';
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches);
  useEffect(() => {
    const mq = window.matchMedia(NARROW);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

// スマホでの、タイムラインの向き（縦＝日付が上から下／横＝PCと同じ、日付が左から右）。選んだ向きは、この端末に覚える。
const ORIENT_KEY = 'hinata_timeline_orient_v1';
type Orient = 'vertical' | 'horizontal';
function loadOrient(): Orient {
  try {
    return localStorage.getItem(ORIENT_KEY) === 'horizontal' ? 'horizontal' : 'vertical';
  } catch {
    return 'vertical';
  }
}

// 終日・開始時刻なし・お休み ＝ 帯。それ以外は開始時刻が 12:00 より前なら午前、以降なら午後。
const isBand = (e: FamilyEvent) => e.kind === 'off' || e.allDay || !e.startTime;
const isAm = (e: FamilyEvent) => (e.startTime ?? '') < '12:00';
const shortTime = (t?: string) => (t ? `${Number(t.slice(0, 2))}:${t.slice(3, 5)}` : '');

interface TlRow {
  key: string;
  label: string;
  color: string;
  soft: string;
  pick: (e: FamilyEvent) => boolean;
  memberId?: string;
}

const TimelineCell: React.FC<{ list: FamilyEvent[]; row: TlRow; classes: string; onAdd: () => void }> = ({ list, row, classes, onAdd }) => {
  const { openEditor } = useStore();
  const bands = list.filter(isBand);
  const timed = list.filter((e) => !isBand(e));
  const am = timed.filter(isAm);
  const pm = timed.filter((e) => !isAm(e));
  const hasOff = bands.some((e) => e.kind === 'off');
  const chip = (e: FamilyEvent, band: boolean) => {
    const off = e.kind === 'off';
    return (
      <button
        key={e.id}
        className={`tl-chip ${band ? 'band' : ''}`}
        style={{ background: off ? '#f6d9d4' : row.soft, borderLeftColor: off ? '#c4584a' : row.color }}
        onClick={(ev) => {
          ev.stopPropagation();
          openEditor({ event: e });
        }}
      >
        {!band && e.startTime && <b className="tl-time">{shortTime(e.startTime)}</b>}
        <Rep e={e} />
        {off ? '休み' : e.title}
      </button>
    );
  };
  return (
    <div className={`tl-cell ${hasOff ? 'off' : ''} ${classes}`} onClick={onAdd}>
      {bands.length > 0 && <div className="tl-bands">{bands.map((e) => chip(e, true))}</div>}
      <div className="tl-half am">{am.map((e) => chip(e, false))}</div>
      <div className="tl-half pm">{pm.map((e) => chip(e, false))}</div>
    </div>
  );
};

export const TimelineView: React.FC = () => {
  const { year, month, events, members, openEditor, setSelectedDate, navSeq, scrollMonth } = useStore();
  const narrow = useNarrow();
  const [orient, setOrientState] = useState<Orient>(loadOrient);
  const setOrient = (o: Orient) => {
    setOrientState(o);
    try {
      localStorage.setItem(ORIENT_KEY, o);
    } catch {
      // 覚えられなくても、今回は切り替わる
    }
  };
  // 縦型にするのは「狭い画面で、縦を選んでいるとき」だけ。広い画面は、いつも横長の表。
  const vertical = narrow && orient === 'vertical';
  const pad = (n: number) => String(n).padStart(2, '0');
  const rootRef = useRef<HTMLDivElement>(null);

  // 向きが変わったら、前の向きのスクロール位置を引き継がない（描く前に先頭へ戻す）。このあと、見ている月の頭／今日へ寄せ直す
  useLayoutEffect(() => {
    const sc = document.querySelector('.content');
    if (sc) sc.scrollTop = 0;
  }, [vertical]);

  // 月をまたいで続けて見られるようにする（前後の月を並べ、端に近づいたら足す。上の月の表示は、いま見ている位置に合わせる）
  const { months } = useMonthWindow({
    year,
    month,
    navKey: `${navSeq}-${vertical ? 'v' : 'h'}`,
    axis: vertical ? 'y' : 'x',
    getScroller: () => (vertical ? ((rootRef.current?.closest('.content') as HTMLElement | null) ?? null) : ((rootRef.current?.querySelector('.people-scroll') as HTMLElement | null) ?? null)),
    rootRef,
    readOffset: vertical ? 130 : 150,
    startPad: vertical ? 96 : 76,
    todayAlign: 'center',
    onFocus: scrollMonth,
  });
  const todayStr = formatDate(new Date());
  const holCache = new Map<number, Record<string, string>>();
  const holidaysOf = (y: number) => {
    if (!holCache.has(y)) holCache.set(y, getJapaneseHolidays(y));
    return holCache.get(y) as Record<string, string>;
  };
  const dayList = months.flatMap(({ y, m }) =>
    Array.from({ length: new Date(y, m, 0).getDate() }, (_, i) => {
      const d = i + 1;
      const dateStr = `${y}-${pad(m)}-${pad(d)}`;
      return { d, y, m, dateStr, dow: new Date(y, m - 1, d).getDay(), holiday: holidaysOf(y)[dateStr], monthStart: d === 1, isToday: dateStr === todayStr };
    })
  );

  // 1日ごとの予定は、人の行ごとに調べ直さず、日ごとに1回だけ取り出す（月を続けて並べると、日数が多くなるため）
  const dayEvents = new Map<string, FamilyEvent[]>();
  for (const d of dayList) dayEvents.set(d.dateStr, eventsOn(events, d.dateStr));

  const rows: TlRow[] = [
    { key: 'all', label: '全体', color: ALL_COLOR, soft: ALL_SOFT, pick: (e) => e.memberIds.length === 0 },
    ...members.map((m) => ({ key: m.id, label: m.name, color: m.color, soft: m.soft, pick: (e: FamilyEvent) => e.memberIds.length > 0 && appliesTo(e, m.id), memberId: m.id })),
  ];
  const dayClasses = (d: { dow: number; holiday?: string }) => (d.dow === 0 || d.holiday ? 'sun-bg' : d.dow === 6 ? 'sat-bg' : '');
  const add = (dateStr: string, memberId?: string) => () => {
    setSelectedDate(dateStr);
    openEditor({ date: dateStr, memberId });
  };

  const hint = (
    <p className="hint">
      各マスは上が午前（AM）、下が午後（PM）です。{vertical ? '上下にスクロールすると、前の月・次の月へ続けて見られます。' : '左右にスライドすると、前の月・次の月へ続けて見られます。'}マスをタップすると予定を足せます。
      {narrow && !vertical && '表の上をなぞると表が動きます。月を飛ばしたいときは、上の矢印か、表の外（この文のあたり）からなぞってください。'}
    </p>
  );

  // 縦／横の切り替え（スマホなど狭い画面だけ）
  const orientSwitch = narrow ? (
    <div className="tl-toolbar">
      <div className="orient-switch" role="group" aria-label="タイムラインの向き">
        <button type="button" className={vertical ? 'on' : ''} aria-pressed={vertical} onClick={() => setOrient('vertical')}>
          ↕ 縦向き
        </button>
        <button type="button" className={!vertical ? 'on' : ''} aria-pressed={!vertical} onClick={() => setOrient('horizontal')}>
          ↔ 横向き
        </button>
      </div>
    </div>
  ) : null;

  // スマホ（縦）：行＝日付、列＝全体・たかし・みさき・あおい・りく
  if (vertical) {
    return (
      <div className="people-wrap" ref={rootRef}>
        {orientSwitch}
        <div className="tl-v" style={{ gridTemplateColumns: `44px repeat(${rows.length}, minmax(0, 1fr))`, '--tl-bar': '46px' } as React.CSSProperties}>
          <div className="tl-v-head corner" />
          {rows.map((r) => (
            <div key={r.key} className="tl-v-head" style={{ background: r.soft, color: r.color, borderBottomColor: r.color }}>
              {r.label}
            </div>
          ))}
          {dayList.map((d) => (
            <React.Fragment key={d.dateStr}>
              {d.monthStart && (
                <div className="tl-v-month" data-month-head={monthKey(d.y, d.m)}>
                  {d.y}年{d.m}月
                </div>
              )}
              <div data-today-target={d.isToday ? '1' : undefined} className={`tl-v-date ${d.holiday ? 'sun' : dowClass(d.dow)} ${d.isToday ? 'today' : ''}`}>
                <b>{d.d}</b>
                <span className="tl-dow">{TL_WEEKDAYS[d.dow]}</span>
              </div>
              {rows.map((r) => (
                <TimelineCell key={r.key} row={r} list={(dayEvents.get(d.dateStr) ?? []).filter(r.pick)} classes={`${dayClasses(d)} ${d.isToday ? 'today-row' : ''}`} onAdd={add(d.dateStr, r.memberId)} />
              ))}
            </React.Fragment>
          ))}
        </div>
        {hint}
      </div>
    );
  }

  // 横長の表（広い画面、またはスマホで「横向き」を選んだとき）：行＝人、列＝日付
  return (
    <div className="people-wrap" ref={rootRef}>
      {orientSwitch}
      <div className="people-scroll">
        <div className="people-table" style={{ gridTemplateColumns: `64px repeat(${dayList.length}, 92px)` }}>
          <div className="p-corner" />
          {dayList.map((d) => (
            <div
              key={d.dateStr}
              data-today-target={d.isToday ? '1' : undefined}
              data-month-head={d.monthStart ? monthKey(d.y, d.m) : undefined}
              className={`p-head ${d.holiday ? 'sun' : dowClass(d.dow)} ${d.isToday ? 'today' : ''} ${d.monthStart ? 'month-start' : ''}`}
            >
              {d.monthStart && (
                <span className="p-month">
                  {d.y}年{d.m}月
                </span>
              )}
              <b>{d.d}</b>
              <span className="tl-dow">{TL_WEEKDAYS[d.dow]}</span>
            </div>
          ))}
          {rows.map((r) => (
            <React.Fragment key={r.key}>
              <div className="p-name" style={{ background: r.soft, color: r.color, borderRightColor: r.color }}>
                {r.label}
              </div>
              {dayList.map((d) => (
                <TimelineCell key={d.dateStr} row={r} list={(dayEvents.get(d.dateStr) ?? []).filter(r.pick)} classes={`${dayClasses(d)} ${d.monthStart ? 'month-start-col' : ''}`} onAdd={add(d.dateStr, r.memberId)} />
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>
      {hint}
    </div>
  );
};

// ---- 一覧 ----
// 月をまたいで続けて見られる（前後の月を並べ、端に近づいたら足す）。月の頭に「2026年11月」の見出しが入る。
export const ListView: React.FC = () => {
  const { year, month, events, members, openEditor, openDaySheet, setSelectedDate, navSeq, scrollMonth } = useStore();
  const pad = (n: number) => String(n).padStart(2, '0');
  const rootRef = useRef<HTMLDivElement>(null);
  const { months } = useMonthWindow({
    year,
    month,
    navKey: navSeq,
    axis: 'y',
    getScroller: () => (rootRef.current?.closest('.content') as HTMLElement | null) ?? null,
    rootRef,
    readOffset: 80,
    startPad: 6,
    todayAlign: 'start',
    onFocus: scrollMonth,
  });
  const now = new Date();
  const todayStr = formatDate(now);
  const holCache = new Map<number, Record<string, string>>();
  const holidaysOf = (y: number) => {
    if (!holCache.has(y)) holCache.set(y, getJapaneseHolidays(y));
    return holCache.get(y) as Record<string, string>;
  };

  const monthBlock = ({ y, m }: { y: number; m: number }) => {
    const days = new Date(y, m, 0).getDate();
    const holidays = holidaysOf(y);
    const groups = Array.from({ length: days }, (_, i) => {
      const dateStr = `${y}-${pad(m)}-${pad(i + 1)}`;
      return { dateStr, list: eventsOn(events, dateStr) };
    }).filter((g) => g.list.length > 0);
    // 今月だけ：今日（または、今日より先で、いちばん近い予定のある日）が、「今日の位置」。
    // 今日に予定がないときは、「今日（予定はありません）」の行を、その位置に入れて、今日の位置が分かるようにする。
    const isThisMonth = now.getFullYear() === y && now.getMonth() + 1 === m;
    const target = isThisMonth ? groups.find((g) => g.dateStr >= todayStr)?.dateStr : undefined;
    const todayEmpty = isThisMonth && !groups.some((g) => g.dateStr === todayStr);
    const showTodayRowBefore = todayEmpty ? (groups.find((g) => g.dateStr > todayStr)?.dateStr ?? '__end') : undefined;
    const todayRow = (
      <div key="__today" data-today-target="1" className="list-today-empty">
        <b>今日 {formatDateJapanese(todayStr)}</b>
        <small>予定はありません</small>
      </div>
    );
    return (
      <React.Fragment key={monthKey(y, m)}>
        <h2 className="list-month" data-month-head={monthKey(y, m)}>
          {y}年{m}月
        </h2>
        {groups.length === 0 && !todayEmpty && (
          <div className="list-month-empty">
            <span>この月の予定は、まだありません。</span>
            <button type="button" className="btn small" onClick={() => openEditor({ date: `${y}-${pad(m)}-01` })}>
              予定を足す
            </button>
          </div>
        )}
        {groups.map((g) => {
          const dow = new Date(`${g.dateStr}T00:00:00`).getDay();
          const isTarget = g.dateStr === target;
          const isToday = isThisMonth && g.dateStr === todayStr;
          return (
            <React.Fragment key={g.dateStr}>
              {showTodayRowBefore === g.dateStr && todayRow}
              <section data-today-target={isTarget && showTodayRowBefore !== g.dateStr ? '1' : undefined} className={`list-day ${isToday ? 'today' : ''}`}>
                <h3
                  className={holidays[g.dateStr] ? 'sun' : dowClass(dow)}
                  onClick={() => {
                    setSelectedDate(g.dateStr);
                    openDaySheet(g.dateStr);
                  }}
                >
                  {isToday && <span className="list-today-badge">今日</span>}
                  {formatDateJapanese(g.dateStr)}
                  {holidays[g.dateStr] && <small> {holidays[g.dateStr]}</small>}
                </h3>
                {g.list.map((e) => (
                  <EventRow key={e.id} e={e} members={members} onClick={() => openEditor({ event: e })} />
                ))}
              </section>
            </React.Fragment>
          );
        })}
        {showTodayRowBefore === '__end' && todayRow}
      </React.Fragment>
    );
  };

  return (
    <div className="list-view" ref={rootRef}>
      {months.map(monthBlock)}
    </div>
  );
};

// showNote：メモも見せる（「その日の予定」の小窓で使う）
export const EventRow: React.FC<{ e: FamilyEvent; members: Member[]; onClick: () => void; showNote?: boolean }> = ({ e, members, onClick, showNote }) => {
  const col = eventColors(e, members);
  return (
    <button className="event-row" onClick={onClick} style={{ borderLeftColor: col.color, background: col.soft }}>
      <span className="ev-time">{timeLabel(e)}</span>
      <span className="ev-main">
        <span className="ev-title">
          <Rep e={e} />
          {e.kind === 'off' ? `お休み` : e.title}
        </span>
        {e.sourceName && <span className="ev-tag">🏷️ {e.sourceName}</span>}
        {showNote && e.note && <span className="ev-note">{e.note}</span>}
      </span>
      <span className="ev-who" style={{ color: col.color }}>
        {memberLabel(e, members)}
      </span>
    </button>
  );
};
