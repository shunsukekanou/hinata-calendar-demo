import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CalendarDays, ChartNoAxesGantt, Cloud, CloudOff, List, Lock, Plus, RefreshCw, Settings, Upload } from 'lucide-react';
import { StoreProvider, useStore } from './store';
import { PinGate, useLock } from './components/PinGate';
import { ListView, MonthNav, MonthView, TimelineView } from './components/Views';
import { DaySheet, EventEditor } from './components/Sheets';
import { ImportSheets } from './components/ImportSheets';
import { SettingsSheet } from './components/SettingsSheet';
import { useSwipe } from './utils/swipe';
import type { ViewMode } from './types';

const TABS: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
  { id: 'month', label: '月', icon: <CalendarDays size={18} /> },
  { id: 'people', label: 'タイムライン', icon: <ChartNoAxesGantt size={18} /> },
  { id: 'list', label: '一覧', icon: <List size={18} /> },
];

const SyncPill: React.FC = () => {
  const { sync, syncNow } = useStore();
  const { state, pending } = sync;
  let label = '同期済み';
  let icon = <Cloud size={14} />;
  if (state === 'off') {
    label = 'この端末のみ';
    icon = <CloudOff size={14} />;
  } else if (state === 'syncing') {
    label = '同期中…';
    icon = <RefreshCw size={14} className="spin" />;
  } else if (state === 'offline') {
    label = pending > 0 ? `オフライン・未送信${pending}件` : 'オフライン';
    icon = <CloudOff size={14} />;
  } else if (state === 'error') {
    label = '同期エラー';
    icon = <CloudOff size={14} />;
  } else if (pending > 0) {
    label = `未送信${pending}件`;
  }
  return (
    <button className={`sync-pill ${state}`} onClick={syncNow} disabled={state === 'off'} title={sync.message ?? '押すと今すぐ同期します'}>
      {icon}
      {label}
    </button>
  );
};

const Main: React.FC = () => {
  const { view, setView, selectedDate, openEditor, openImport, members, sync, goNext, goPrev, year, month } = useStore();
  const { lock } = useLock();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const contentRef = useRef<HTMLElement>(null);
  // 画面が切り替わる向き（動きの演出用）。ボタンで切り替えたときは向きなし。
  const [anim, setAnim] = useState<'' | 'from-right' | 'from-left' | 'from-bottom' | 'from-top'>('');

  // スワイプで月が変わったら、新しい月の一番上から見せる。
  // ・位置は「画面を描く前」に戻す（描いたあとだと、ずれた画面が1コマ見えてちらつく）。
  // ・指を離したあとの「勢い」のスクロールが新しい月にかかって流れないよう、直後のごく短い間（0.32秒）だけ
  //   スクロールを止める。スクロールバーの場所は常に確保してあるので、止めても画面の幅は変わらない。
  //   次に指が触れたらすぐ解除する。
  const toTopAfterMonth = useRef(false);
  const unlockScroll = useRef<(() => void) | null>(null);
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const on = () => unlockScroll.current?.();
    el.addEventListener('touchstart', on, { passive: true });
    return () => el.removeEventListener('touchstart', on);
  }, []);
  useLayoutEffect(() => {
    if (!toTopAfterMonth.current) return;
    toTopAfterMonth.current = false;
    const el = contentRef.current;
    if (!el) return;
    el.style.overflowY = 'hidden';
    el.scrollTop = 0;
    const release = () => {
      clearTimeout(timer);
      el.style.overflowY = '';
      unlockScroll.current = null;
    };
    const timer = setTimeout(release, 320);
    unlockScroll.current = release;
    return release;
  }, [year, month]);
  // タブが変わったら、前のタブのスクロール位置を引き継がず、先頭から見せる（描く前に戻す）。
  useLayoutEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [view]);
  // 月を切り替える。vertical＝上下スワイプ（下から入ってくる／上から入ってくる）、horizontal＝左右スワイプ（右から／左から）
  const goMonth = (next: boolean, how: 'vertical' | 'horizontal' = 'vertical') => {
    // 待たずにすぐ切り替える
    // 一覧・タイムラインは、月をまたいで続けて見られる作り。月の頭への移動は、その画面が自分で行う（先頭に戻さない・スライドの動きも付けない）
    if (view === 'month') {
      setAnim(how === 'horizontal' ? (next ? 'from-right' : 'from-left') : next ? 'from-bottom' : 'from-top');
      toTopAfterMonth.current = true;
      if (contentRef.current) contentRef.current.scrollTop = 0;
    }
    if (next) goNext();
    else goPrev();
  };
  // 左右＝月の切り替え（月・タイムライン・一覧のどの画面でも。左へなぞる＝次の月、右へなぞる＝前の月）、
  // 上下（月カレンダーのときだけ）＝月の切り替え。タブの切り替えは、画面上部のボタンで行う。
  useSwipe(contentRef, {
    onLeft: () => goMonth(true, 'horizontal'),
    onRight: () => goMonth(false, 'horizontal'),
    onUp: view === 'month' ? () => goMonth(true) : undefined,
    onDown: view === 'month' ? () => goMonth(false) : undefined,
  });

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="brand-mark">🏠</span>
          <h1>
            家族カレンダー<small className="family-tag">ひなた家（デモ）</small>
          </h1>
          <div className="legend">
            {members.map((m) => (
              <span key={m.id} className="legend-item" style={{ color: m.color }}>
                <i style={{ background: m.color }} />
                {m.name}
              </span>
            ))}
          </div>
        </div>
        <div className="top-btns">
          <button className="icon-btn menu-btn" onClick={() => openImport('menu')} aria-label="取り込み・保存">
            <Upload size={22} />
            <span>取込</span>
          </button>
          <button className="icon-btn menu-btn" onClick={() => setSettingsOpen(true)} aria-label="設定">
            <Settings size={22} />
            <span>設定</span>
          </button>
          <button className="icon-btn menu-btn" onClick={lock} aria-label="ロックする（暗証番号の画面に戻る）">
            <Lock size={22} />
            <span>ロック</span>
          </button>
        </div>
      </header>

      <MonthNav />
      <div className="sync-row no-print">
        <SyncPill />
        {(sync.state === 'error' || sync.state === 'offline') && sync.message && <span className="sync-msg">{sync.message}</span>}
      </div>

      <nav className="tabs no-print" aria-label="表示の切り替え">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={view === t.id ? 'on' : ''}
            onClick={() => {
              setAnim('');
              setView(t.id);
            }}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>

      <main className="content" ref={contentRef}>
        <div key={view === 'month' ? `month-${year}-${month}` : view} className={`view-anim ${anim}`} onAnimationEnd={() => setAnim('')}>
          {view === 'month' && <MonthView />}
          {view === 'people' && <TimelineView />}
          {view === 'list' && <ListView />}
        </div>
      </main>

      <button className="fab" onClick={() => openEditor({ date: selectedDate })} aria-label="予定を足す">
        <Plus size={28} />
      </button>

      <DaySheet />
      <EventEditor />
      <ImportSheets />
      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}
    </div>
  );
};

export const App: React.FC = () => (
  <PinGate>
    <StoreProvider>
      <Main />
    </StoreProvider>
  </PinGate>
);

export default App;
