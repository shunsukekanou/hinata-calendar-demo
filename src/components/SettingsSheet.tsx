import React, { useState } from 'react';
import { useStore } from '../store';
import { loadSettings, saveSettings } from '../utils/settings';
import type { AppSettings, StartMonth, WeekStart } from '../utils/settings';
import { Sheet } from './Sheets';
import { useLock } from './PinGate';
import { InAppNotice, InstallPreparing, InstallSuccess, IosInstallSteps, MenuInstallGuide, useInstallState } from './InstallGuide';

// 設定（この端末だけに保存。選んだ時点で、すぐ保存される）
const OPTIONS: { id: StartMonth; icon: string; label: string; note: string }[] = [
  { id: 'today', icon: '📅', label: '常に今月（今日）から開く', note: '開くたびに、今月のカレンダーが出ます（初期の設定）。' },
  { id: 'keep', icon: '🔄', label: '閉じる前の月をキープする', note: '前に見ていた月のまま開きます。' },
];

const WEEK_OPTIONS: { id: WeekStart; label: string; note: string }[] = [
  { id: 'sun', label: '日曜日はじまり', note: '週の左端が日曜日です（初期の設定）。' },
  { id: 'mon', label: '月曜日はじまり', note: '週の左端が月曜日です。' },
];

// ホーム画面に追加（ふつうのブラウザで開いているときだけ出す。ホーム画面のアプリとして開いているときは出さない）
const InstallSection: React.FC = () => {
  const { state, install, standalone } = useInstallState();
  const [msg, setMsg] = useState('');
  if (standalone) return null;
  return (
    <>
      <h3 className="panel-title">📲 ホーム画面に追加</h3>
      <p className="muted">いまは、ブラウザで開いています。ホーム画面にアイコンを置くと、アプリのように、すぐ開けます。</p>
      {state === 'done' && <InstallSuccess />}
      {state === 'inapp' && <InAppNotice />}
      {state === 'ios' && <IosInstallSteps />}
      {state === 'waiting' && <InstallPreparing />}
      {state === 'unavailable' && <MenuInstallGuide />}
      {state === 'ready' && (
        <button
          type="button"
          className="btn primary full"
          onClick={async () => {
            const r = await install();
            setMsg(r === 'dismissed' ? '追加はキャンセルされました。' : r === 'unavailable' ? 'この画面からは追加できませんでした。ブラウザのメニュー（右上の「⋮」）から追加してください。' : '');
          }}
        >
          📲 ホーム画面に追加する
        </button>
      )}
      {msg && <p className="muted">{msg}</p>}
    </>
  );
};

export const SettingsSheet: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { members, setWeekStart, resetDemo } = useStore();
  const { lock } = useLock();
  const [s, setS] = useState<AppSettings>(loadSettings);
  const update = (next: AppSettings) => {
    setS(next);
    saveSettings(next);
  };

  return (
    <Sheet title="⚙️ 設定" onClose={onClose}>
      <InstallSection />

      <h3 className="panel-title" style={{ marginTop: 22 }}>アプリを開いたときの画面</h3>
      <div className="radio-list" role="radiogroup" aria-label="アプリを開いたときの画面">
        {OPTIONS.map((o) => (
          <label key={o.id} className={`radio-card ${s.startMonth === o.id ? 'on' : ''}`}>
            <input type="radio" name="startMonth" checked={s.startMonth === o.id} onChange={() => update({ ...s, startMonth: o.id })} />
            <span className="rc-body">
              <b>
                {o.icon} {o.label}
              </b>
              <small>{o.note}</small>
            </span>
          </label>
        ))}
      </div>
      <p className="muted">この設定は、この端末だけに保存されます（スマホとパソコンで、別々に決められます）。</p>

      <h3 className="panel-title" style={{ marginTop: 22 }}>カレンダーの週の始まり</h3>
      <div className="radio-list" role="radiogroup" aria-label="カレンダーの週の始まり">
        {WEEK_OPTIONS.map((o) => (
          <label key={o.id} className={`radio-card ${s.weekStart === o.id ? 'on' : ''}`}>
            <input
              type="radio"
              name="weekStart"
              checked={s.weekStart === o.id}
              onChange={() => {
                setWeekStart(o.id);
                setS({ ...s, weekStart: o.id });
              }}
            />
            <span className="rc-body">
              <b>{o.label}</b>
              <small>{o.note}</small>
            </span>
          </label>
        ))}
      </div>

      <h3 className="panel-title" style={{ marginTop: 22 }}>予定の振り分けに使う別名</h3>
      <p className="muted">
        TimeTree などのファイルを取り込むとき、予定の名前・内容・参加者に、ここに書いた言葉があれば、その人の予定にします。名前（たかしなど）は、書かなくても使われます。
        複数あるときは、カンマ（,）で区切ります。ひらがな・カタカナ・大文字小文字の違いは区別しません。
      </p>
      {members.map((m) => (
        <label key={m.id} className="field">
          <span style={{ color: m.color }}>{m.name} の別名</span>
          <input
            value={s.aliases[m.id] ?? ''}
            onChange={(e) => update({ ...s, aliases: { ...s.aliases, [m.id]: e.target.value } })}
            placeholder="例：たかし, taka, 自分のアカウント名"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
      ))}
      <p className="muted">※ 「りく」のような短い言葉は、別の言葉（りくつ など）にも当てはまって、間違った人に振り分けてしまうことがあります。できるだけ長い言葉がおすすめです。</p>

      <h3 className="panel-title" style={{ marginTop: 22 }}>🔒 暗証番号の画面（デモ）</h3>
      <p className="muted">本物の版では、家族だけが開けるように、4桁の暗証番号の画面があります。デモ版では最初から開くようにしてあります。画面を見たいときは、下のボタンを押してください（デモの番号は、画面に書いてあります）。</p>
      <button
        className="btn"
        onClick={() => {
          onClose();
          lock();
        }}
      >
        暗証番号の画面を見る
      </button>

      <h3 className="panel-title" style={{ marginTop: 22 }}>🔄 デモを初めの状態に戻す</h3>
      <p className="muted">取り込んだ予定や、自分で足した予定を消して、最初の状態（家族の行事・仕事・学校の予定だけ）に戻します。</p>
      <button
        className="btn"
        onClick={() => {
          if (!window.confirm('予定を、デモの初めの状態に戻します。よろしいですか？')) return;
          resetDemo();
          onClose();
        }}
      >
        デモを初めの状態に戻す
      </button>
    </Sheet>
  );
};
