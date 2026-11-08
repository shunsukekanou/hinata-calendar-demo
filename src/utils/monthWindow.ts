// 一覧・タイムラインを、月をまたいで続けて見られるようにするための部品。
//
// 考え方：
//   ・見ている月（store の year/month）の前後の月を、続けて並べて描く（「窓」）。窓は、はじめは「前月・今月・次月」の3か月。
//   ・端に近づいたら（スクロール・ホイール・指でなぞる）、前後の月を1つずつ足す。窓は最大 MAX_WINDOW_MONTHS か月まで（遠い側を外す）。
//   ・足したり外したりしても、見ている場所が動かないよう、「見ていた月の頭の位置」を、前後で合わせる。
//   ・上の月の表示（年月）は、いま見ている位置の月に合わせて変える（scrollMonth）。
//   ・矢印・左右スワイプ・「今日」（＝画面の外からの移動）のときは、その月の頭（今月なら今日の位置）へ寄せる。
//     寄せたあと、人が触れる（指・ホイール・キー）までは、予定が届いて高さが変わっても、寄せ直す（位置を保つ）。
//
// 月の頭には、表示側が data-month-head="YYYY-MM" を付ける。今日の位置には data-today-target を付ける。
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const pad2 = (n: number) => String(n).padStart(2, '0');
export const monthIndex = (y: number, m: number) => y * 12 + (m - 1);
export const monthOfIndex = (i: number) => ({ y: Math.floor(i / 12), m: (i % 12) + 1 });
export const monthKey = (y: number, m: number) => `${y}-${pad2(m)}`;
export const MAX_WINDOW_MONTHS = 12;

const EDGE_BEFORE = 320; // 先頭からこれより近づいたら、前の月を足す（px）
const EDGE_AFTER = 520; // 末尾にこれより近づいたら、次の月を足す（px）

export interface MonthWindow {
  from: number;
  to: number;
}
export const windowAround = (y: number, m: number): MonthWindow => {
  const c = monthIndex(y, m);
  return { from: c - 1, to: c + 1 };
};
export const monthsOf = (w: MonthWindow) => Array.from({ length: w.to - w.from + 1 }, (_, i) => monthOfIndex(w.from + i));

/** 窓を、前に1か月広げる（広がりすぎたら、後ろを1か月外す） */
export const extendBefore = (w: MonthWindow): MonthWindow => ({ from: w.from - 1, to: w.to - w.from + 1 >= MAX_WINDOW_MONTHS ? w.to - 1 : w.to });
/** 窓を、後ろに1か月広げる（広がりすぎたら、前を1か月外す） */
export const extendAfter = (w: MonthWindow): MonthWindow => ({ from: w.to - w.from + 1 >= MAX_WINDOW_MONTHS ? w.from + 1 : w.from, to: w.to + 1 });

export interface MonthWindowOptions {
  year: number;
  month: number;
  /** 画面の外からの移動（矢印・スワイプ・今日・向きの切り替え）があるたびに変わる値 */
  navKey: string | number;
  axis: 'x' | 'y';
  /** 動かす入れ物（縦：.content／横：.people-scroll） */
  getScroller: () => HTMLElement | null;
  /** 中身（大きさの変化を見て、位置を保つ） */
  rootRef: React.RefObject<HTMLElement | null>;
  /** 「いま見ている月」を決める線の位置（入れ物の端から、何 px のところか） */
  readOffset: number;
  /** 月の頭を寄せるとき、入れ物の端から何 px あけるか（固定の見出しの分） */
  startPad: number;
  /** 今月の「今日」の位置の合わせ方 */
  todayAlign: 'start' | 'center';
  onFocus: (y: number, m: number) => void;
}

export function useMonthWindow(opts: MonthWindowOptions): { months: { y: number; m: number }[] } {
  const o = useRef(opts);
  o.current = opts;
  const [range, setRange] = useState<MonthWindow>(() => windowAround(opts.year, opts.month));
  const pinned = useRef(true); // 寄せたあと、人が触れるまでは true
  const needAlign = useRef(true);
  const anchor = useRef<{ key: string; offset: number } | null>(null);
  const prevNav = useRef<string | number | null>(null);
  const rangeRef = useRef(range);
  rangeRef.current = range;
  const canExtend = () => rangeRef.current.to - rangeRef.current.from + 1 < MAX_WINDOW_MONTHS;

  // ---- 位置の計算 ----
  const posOf = (el: HTMLElement, c: HTMLElement) => {
    const er = el.getBoundingClientRect();
    const cr = c.getBoundingClientRect();
    return o.current.axis === 'y' ? er.top - cr.top : er.left - cr.left;
  };
  const scrollBy = (c: HTMLElement, delta: number) => {
    if (Math.abs(delta) < 0.5) return;
    if (o.current.axis === 'y') c.scrollTop += delta;
    else c.scrollLeft += delta;
  };

  // 見ている月の頭に、位置を合わせる。今月なら今日の位置に合わせる
  const align = () => {
    const { year, month, getScroller, rootRef, axis, startPad, todayAlign } = o.current;
    const c = getScroller();
    const root = rootRef.current;
    if (!c || !root) return;
    const now = new Date();
    const isCurrent = now.getFullYear() === year && now.getMonth() + 1 === month;
    const today = isCurrent ? root.querySelector<HTMLElement>('[data-today-target]') : null;
    const head = root.querySelector<HTMLElement>(`[data-month-head="${monthKey(year, month)}"]`);
    const el = today ?? head;
    if (!el) return;
    const pos = posOf(el, c);
    const size = axis === 'y' ? el.getBoundingClientRect().height : el.getBoundingClientRect().width;
    const view = axis === 'y' ? c.clientHeight : c.clientWidth;
    const want = today && todayAlign === 'center' ? view / 2 - size / 2 : startPad;
    const delta = pos - want;
    const before = axis === 'y' ? c.scrollTop : c.scrollLeft;
    scrollBy(c, delta);
    const moved = (axis === 'y' ? c.scrollTop : c.scrollLeft) - before;
    // 動かしたい分まで動けなかった（中身が足りない）ときは、月を足して、もう一度寄せる
    if (delta - moved > 1 && canExtend()) {
      needAlign.current = true;
      setRange(extendAfter);
    } else if (delta - moved < -1 && canExtend()) {
      needAlign.current = true;
      setRange(extendBefore);
    }
  };

  // スクロールできる量が、画面＋前後の余裕より少ないときは、月を足して、増やす（足しすぎないよう、窓の上限まで）
  const fillIfShort = (): boolean => {
    const { getScroller, axis, year, month } = o.current;
    const c = getScroller();
    if (!c || !canExtend()) return false;
    const size = axis === 'y' ? c.scrollHeight : c.scrollWidth;
    const view = axis === 'y' ? c.clientHeight : c.clientWidth;
    if (size >= view + EDGE_BEFORE + EDGE_AFTER) return false;
    const r = rangeRef.current;
    const idx = monthIndex(year, month);
    if (!pinned.current) captureAnchor();
    setRange(r.to - idx <= idx - r.from ? extendAfter : extendBefore);
    return true;
  };

  // いま見ている月（読む線に重なる月の頭）
  const focusKeyNow = (): string | null => {
    const { getScroller, rootRef, readOffset } = o.current;
    const c = getScroller();
    const root = rootRef.current;
    if (!c || !root) return null;
    const heads = Array.from(root.querySelectorAll<HTMLElement>('[data-month-head]'));
    if (!heads.length) return null;
    let cur = heads[0].dataset.monthHead ?? null;
    for (const h of heads) {
      if (posOf(h, c) <= readOffset) cur = h.dataset.monthHead ?? cur;
      else break;
    }
    return cur;
  };
  const captureAnchor = () => {
    const { getScroller, rootRef } = o.current;
    const c = getScroller();
    const root = rootRef.current;
    if (!c || !root) return;
    const key = focusKeyNow();
    const head = key ? root.querySelector<HTMLElement>(`[data-month-head="${key}"]`) : null;
    if (key && head) anchor.current = { key, offset: posOf(head, c) };
  };

  // ---- 画面の外からの移動：窓に入っていなければ作り直し、その月の頭へ寄せる ----
  useLayoutEffect(() => {
    if (prevNav.current === opts.navKey) return;
    prevNav.current = opts.navKey;
    pinned.current = true;
    needAlign.current = true;
    const idx = monthIndex(opts.year, opts.month);
    setRange((r) => (idx < r.from || idx > r.to ? windowAround(opts.year, opts.month) : r));
  });
  // 描いたあと：窓の変更で動いた位置を戻す／寄せる予定があれば寄せる
  useLayoutEffect(() => {
    const c = o.current.getScroller();
    const root = o.current.rootRef.current;
    if (anchor.current && c && root) {
      const a = anchor.current;
      anchor.current = null;
      const head = root.querySelector<HTMLElement>(`[data-month-head="${a.key}"]`);
      if (head) scrollBy(c, posOf(head, c) - a.offset);
    }
    const idx = monthIndex(o.current.year, o.current.month);
    if (needAlign.current && idx >= range.from && idx <= range.to) {
      needAlign.current = false;
      align();
    }
    if (!needAlign.current) fillIfShort();
  });

  // ---- 人が触れたら、位置を保つのをやめる／端に近づいたら、月を足す／いまの月を決める ----
  useEffect(() => {
    const c = opts.getScroller();
    if (!c) return;
    let raf = 0;
    const release = () => {
      pinned.current = false;
    };
    const check = () => {
      raf = 0;
      const { axis, onFocus, year, month } = o.current;
      if (!pinned.current) {
        const k = focusKeyNow();
        if (k && k !== monthKey(year, month)) {
          const [yy, mm] = k.split('-').map(Number);
          onFocus(yy, mm);
        }
        const pos = axis === 'y' ? c.scrollTop : c.scrollLeft;
        const size = axis === 'y' ? c.scrollHeight : c.scrollWidth;
        const view = axis === 'y' ? c.clientHeight : c.clientWidth;
        if (!anchor.current) {
          if (pos < EDGE_BEFORE) {
            captureAnchor();
            setRange(extendBefore);
          } else if (size - pos - view < EDGE_AFTER) {
            captureAnchor();
            setRange(extendAfter);
          }
        }
      }
    };
    const soon = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    const touch = () => {
      release();
      soon();
    };
    c.addEventListener('scroll', soon, { passive: true });
    c.addEventListener('wheel', touch, { passive: true });
    c.addEventListener('touchstart', release, { passive: true });
    c.addEventListener('touchmove', touch, { passive: true });
    c.addEventListener('pointerdown', release, { passive: true });
    c.addEventListener('keydown', release);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      c.removeEventListener('scroll', soon);
      c.removeEventListener('wheel', touch);
      c.removeEventListener('touchstart', release);
      c.removeEventListener('touchmove', touch);
      c.removeEventListener('pointerdown', release);
      c.removeEventListener('keydown', release);
    };
  }, [opts.axis, opts.navKey]);

  // 寄せたあと、人が触れるまでは、中身の高さ・幅が変わったら（予定が届いた、など）、寄せ直す
  useEffect(() => {
    const root = opts.rootRef.current;
    if (!root || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (pinned.current) align();
      else fillIfShort();
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, [opts.axis, opts.navKey]);

  return { months: monthsOf(range) };
}
