import { useEffect, useRef } from 'react';

// スワイプ（指でなぞる操作）の判定。タップや、ふつうの上下スクロールとぶつからないようにする。
//   ・指の移動量が一定以上（しきい値）のときだけ発動する
//   ・主な向きが明らか（もう一方の向きの移動量の 1.5〜1.8 倍以上）なときだけ発動する
//   ・上下スワイプ（月の移動）は、画面が一番上／一番下までスクロールされているときだけ発動する
//     （そうでないときは、いつものスクロールとして動く）
const MIN_H = 70; // 左右：これ以上動いたら
const MIN_V = 90; // 上下：これ以上動いたら
const H_RATIO = 1.8;
const V_RATIO = 1.5;
const MAX_MS = 900; // これより長くゆっくりなぞった場合は、スワイプとみなさない

// 入力欄や、自分で横にスクロールする部分（広い画面のタイムライン）から始まった操作は無視する
const IGNORE = 'input, textarea, select, .people-scroll, .no-swipe';

export interface SwipeHandlers {
  onLeft?: () => void; // 指を左へ（＝次の月）
  onRight?: () => void; // 指を右へ（＝前の月）
  onUp?: () => void; // 指を下から上へ（＝次の月）
  onDown?: () => void; // 指を上から下へ（＝前の月）
}

export function useSwipe(ref: React.RefObject<HTMLElement | null>, handlers: SwipeHandlers) {
  const h = useRef(handlers);
  h.current = handlers;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let start: { x: number; y: number; t: number; atTop: boolean; atBottom: boolean } | null = null;

    const onStart = (e: TouchEvent) => {
      const target = e.target as Element | null;
      if (e.touches.length !== 1 || target?.closest(IGNORE)) {
        start = null;
        return;
      }
      const t = e.touches[0];
      start = {
        x: t.clientX,
        y: t.clientY,
        t: Date.now(),
        atTop: el.scrollTop <= 1,
        atBottom: el.scrollTop + el.clientHeight >= el.scrollHeight - 1,
      };
    };
    const onEnd = (e: TouchEvent) => {
      const s = start;
      start = null;
      if (!s || e.changedTouches.length === 0 || Date.now() - s.t > MAX_MS) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      if (ax >= MIN_H && ax > ay * H_RATIO) {
        if (dx < 0) h.current.onLeft?.();
        else h.current.onRight?.();
      } else if (ay >= MIN_V && ay > ax * V_RATIO) {
        if (dy < 0 && s.atBottom) h.current.onUp?.();
        else if (dy > 0 && s.atTop) h.current.onDown?.();
      }
    };
    const onCancel = () => {
      start = null;
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onCancel);
    };
  }, [ref]);
}
