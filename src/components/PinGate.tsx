import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Delete } from 'lucide-react';

// デモ版の暗証番号の画面。
// 本物の版では、家族だけが知っている4桁の番号を入れないとカレンダーが開かない。
// デモ版では、最初からカレンダーを開いておき、「ロック」ボタン（または設定）から、この画面を見られる。
// 番号は、画面に書いてあるデモ用の番号（本物の番号とは関係ない）。
const PIN = '1234';

const MAX_MISS = 5; // 続けて間違えられる回数
const WAIT_SEC = 30; // 超えたときの待ち時間

const LockCtx = createContext<{ lock: () => void } | null>(null);
export const useLock = () => {
  const c = useContext(LockCtx);
  if (!c) throw new Error('PinGate がありません');
  return c;
};

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

const LockScreen: React.FC<{ onOpen: () => void }> = ({ onOpen }) => {
  const [input, setInput] = useState('');
  const [message, setMessage] = useState('');
  const [shake, setShake] = useState(false);
  const [miss, setMiss] = useState(0);
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const waiting = waitUntil > now;
  const left = Math.ceil((waitUntil - now) / 1000);

  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [waiting]);

  const push = useCallback(
    (d: string) => {
      if (waiting) return;
      setMessage('');
      setInput((cur) => (cur.length >= 4 ? cur : cur + d));
    },
    [waiting]
  );
  const back = useCallback(() => setInput((cur) => cur.slice(0, -1)), []);

  // 4桁そろったら確かめる
  const checked = useRef('');
  useEffect(() => {
    if (input.length !== 4 || checked.current === input) return;
    checked.current = input;
    if (input === PIN) {
      onOpen();
      return;
    }
    const m = miss + 1;
    setShake(true);
    setTimeout(() => {
      setShake(false);
      setInput('');
      checked.current = '';
    }, 450);
    if (m >= MAX_MISS) {
      setMiss(0);
      setWaitUntil(Date.now() + WAIT_SEC * 1000);
      setNow(Date.now());
      setMessage(`続けて間違えました。${WAIT_SEC}秒たってからもう一度どうぞ。`);
    } else {
      setMiss(m);
      setMessage('番号が違います。もう一度どうぞ。');
    }
  }, [input, miss, onOpen]);

  // パソコンのキーボードでも入力できる
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) push(e.key);
      else if (e.key === 'Backspace') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [push, back]);

  return (
    <div className="lock">
      <div className="lock-card">
        <div className="lock-mark">🏠</div>
        <h1>家族カレンダー</h1>
        <p className="lock-sub">ひなた家（デモ）</p>
        <p className="lock-sub">家族の合言葉（4桁の番号）を入れてください</p>
        <p className="lock-sub" style={{ fontWeight: 700 }}>
          デモ版の番号は「{PIN}」です
        </p>
        <div className={`lock-dots ${shake ? 'shake' : ''}`} aria-label={`${input.length}桁入力済み`}>
          {[0, 1, 2, 3].map((i) => (
            <i key={i} className={i < input.length ? 'on' : ''} />
          ))}
        </div>
        <p className="lock-msg" role="alert">
          {waiting ? `あと ${left} 秒お待ちください` : message}
        </p>
        <div className="lock-pad">
          {KEYS.map((k) => (
            <button key={k} onClick={() => push(k)} disabled={waiting}>
              {k}
            </button>
          ))}
          <span />
          <button onClick={() => push('0')} disabled={waiting}>
            0
          </button>
          <button className="del" onClick={back} aria-label="ひとつ消す">
            <Delete size={24} />
          </button>
        </div>
      </div>
    </div>
  );
};

// 正しい番号が入るまでは、カレンダー本体（予定の読み込み・同期も）を動かさない。
export const PinGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState(true); // デモ版：最初から開いておく
  const lock = useCallback(() => setOpen(false), []);
  const onOpen = useCallback(() => setOpen(true), []);
  if (!open) return <LockScreen onOpen={onOpen} />;
  return <LockCtx.Provider value={{ lock }}>{children}</LockCtx.Provider>;
};
