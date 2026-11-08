import React, { useState } from 'react';
import { Bell, Plus, Trash2, X } from 'lucide-react';
import { eventsOn, useStore } from '../store';
import { MAX_YEARLY_SPAN_DAYS, daysBetween } from '../utils/repeat';
import { formatDateJapanese, getJapaneseHolidays } from '../utils/holidayUtils';
import { customToken, defaultReminders, reminderLabel, reminderOptions } from '../utils/reminders';
import { EventRow } from './Views';
import type { FamilyEvent, Member } from '../types';

export const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }> = ({
  title,
  onClose,
  children,
  footer,
  wide,
}) => (
  <div className="overlay" onClick={onClose}>
    <div className={`sheet ${wide ? 'wide' : ''}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
      <div className="sheet-head">
        <h2>{title}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="閉じる">
          <X size={22} />
        </button>
      </div>
      <div className="sheet-body">{children}</div>
      {footer && <div className="sheet-foot">{footer}</div>}
    </div>
  </div>
);

// 人を選ぶボタン（何も選ばない = 家族全員）
export const MemberPicker: React.FC<{ members: Member[]; value: string[]; onChange: (v: string[]) => void }> = ({ members, value, onChange }) => (
  <div className="picker">
    <button type="button" className={`pick ${value.length === 0 ? 'on' : ''}`} onClick={() => onChange([])}>
      全体
    </button>
    {members.map((m) => {
      const on = value.includes(m.id);
      return (
        <button
          type="button"
          key={m.id}
          className={`pick ${on ? 'on' : ''}`}
          style={on ? { background: m.color, borderColor: m.color, color: '#fff' } : { borderColor: m.color, color: m.color }}
          onClick={() => onChange(on ? value.filter((x) => x !== m.id) : [...value, m.id])}
        >
          {m.name}
        </button>
      );
    })}
  </div>
);

export const DaySheet: React.FC = () => {
  const { daySheet, openDaySheet, events, members, openEditor } = useStore();
  if (!daySheet) return null;
  const list = eventsOn(events, daySheet);
  const holiday = getJapaneseHolidays(Number(daySheet.slice(0, 4)))[daySheet];
  return (
    <Sheet
      title={formatDateJapanese(daySheet)}
      onClose={() => openDaySheet(null)}
      footer={
        <button
          className="btn primary full"
          onClick={() => {
            openEditor({ date: daySheet });
            openDaySheet(null);
          }}
        >
          <Plus size={18} /> この日に予定を足す
        </button>
      }
    >
      {holiday && <p className="holiday-line">🎌 {holiday}</p>}
      {list.length === 0 ? (
        <p className="muted">予定はありません。</p>
      ) : (
        list.map((e) => (
          <EventRow
            key={e.id}
            e={e}
            members={members}
            showNote
            onClick={() => {
              openEditor({ event: e });
              openDaySheet(null);
            }}
          />
        ))
      )}
    </Sheet>
  );
};

// 通知（リマインド）の設定。LINE WORKS のカレンダーの選び方に合わせる（5分前・10分前…1週間前・直接入力）
const ReminderEditor: React.FC<{ value: string[]; allDay: boolean; onChange: (v: string[]) => void }> = ({ value, allDay, onChange }) => {
  const [custom, setCustom] = useState(false);
  const [n, setN] = useState('15');
  const [unit, setUnit] = useState<'min' | 'hour' | 'day'>('min');
  const [msg, setMsg] = useState('');
  const add = (t: string) => {
    setMsg('');
    if (value.includes(t)) return setMsg('その通知は、もう入っています。');
    onChange([...value, t]);
  };
  return (
    <div className="field reminder-box">
      <span>
        <Bell size={14} /> 通知
      </span>
      {value.length === 0 && <small className="muted">通知はありません。</small>}
      <div className="rem-list">
        {value.map((t) => (
          <span key={t} className="rem-chip">
            {reminderLabel(t)}
            <button type="button" aria-label={`${reminderLabel(t)}の通知を消す`} onClick={() => onChange(value.filter((x) => x !== t))}>
              <X size={13} />
            </button>
          </span>
        ))}
      </div>
      <select
        className="rem-select"
        value=""
        aria-label="通知を足す"
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'custom') setCustom(true);
          else if (v) add(v);
        }}
      >
        <option value="">＋ 通知を足す</option>
        {reminderOptions(allDay).map((o) => (
          <option key={o.token} value={o.token}>
            {o.label}
          </option>
        ))}
        {!allDay && <option value="custom">直接入力…</option>}
      </select>
      {custom && !allDay && (
        <div className="rem-custom">
          <input type="number" min={1} inputMode="numeric" value={n} onChange={(e) => setN(e.target.value)} aria-label="数" />
          <select value={unit} onChange={(e) => setUnit(e.target.value as 'min' | 'hour' | 'day')} aria-label="単位">
            <option value="min">分前</option>
            <option value="hour">時間前</option>
            <option value="day">日前</option>
          </select>
          <button
            type="button"
            className="btn"
            onClick={() => {
              const t = customToken(Number(n), unit);
              if (!t) return setMsg('1以上の整数で、60日前までの範囲で入れてください。');
              add(t);
              setCustom(false);
            }}
          >
            追加
          </button>
        </div>
      )}
      {msg && <small className="error">{msg}</small>}
    </div>
  );
};

export const EventEditor: React.FC = () => {
  const { editor } = useStore();
  if (!editor) return null;
  // 開くたびに入力欄を作り直す
  const key = 'event' in editor ? editor.event.id : `new-${editor.date}-${editor.memberId ?? ''}`;
  return <EditorForm key={key} />;
};

const EditorForm: React.FC = () => {
  const { editor, openEditor, members, addEvent, updateEvent, deleteEvent } = useStore();
  const existing = editor && 'event' in editor ? editor.event : null;
  const init: Omit<FamilyEvent, 'id'> = existing
    ? existing
    : {
        title: '',
        date: editor && 'date' in editor ? editor.date : '',
        allDay: true,
        memberIds: editor && 'memberId' in editor && editor.memberId ? [editor.memberId] : [],
        kind: 'event',
        reminders: defaultReminders(true),
      };
  const [f, setF] = useState<Omit<FamilyEvent, 'id'>>(init);
  // 通知を自分で触っていない新しい予定は、「終日」の切り替えに合わせて、初めの通知も切り替える
  const [remTouched, setRemTouched] = useState(false);
  const [err, setErr] = useState('');
  const set = (p: Partial<FamilyEvent>) => setF((x) => ({ ...x, ...p }));
  const close = () => openEditor(null);

  const save = () => {
    const title = f.kind === 'off' ? f.title.trim() || 'お休み' : f.title.trim();
    if (!title) return setErr('予定の名前を入れてください。');
    if (!f.date) return setErr('日にちを入れてください。');
    if (f.endDate && f.endDate < f.date) return setErr('終わりの日が、始まりの日より前になっています。');
    if (f.repeat === 'yearly' && f.endDate && daysBetween(f.date, f.endDate) > MAX_YEARLY_SPAN_DAYS) return setErr('毎年繰り返す予定は、1年未満の期間にしてください。');
    const data: Omit<FamilyEvent, 'id'> = {
      ...f,
      title,
      endDate: f.endDate && f.endDate !== f.date ? f.endDate : undefined,
      startTime: f.allDay ? undefined : f.startTime || undefined,
      endTime: f.allDay ? undefined : f.endTime || undefined,
      source: f.source ?? 'manual',
    };
    if (existing) updateEvent({ ...data, id: existing.id });
    else addEvent(data);
    close();
  };

  return (
    <Sheet
      title={existing ? '予定を直す' : '予定を足す'}
      onClose={close}
      footer={
        <>
          {existing && (
            <button
              className="btn danger"
              onClick={() => {
                if (existing.repeat === 'yearly' && !window.confirm('毎年繰り返す予定です。すべての年から消えます。よろしいですか？')) return;
                deleteEvent(existing.id);
                close();
              }}
            >
              <Trash2 size={16} /> 消す
            </button>
          )}
          <button className="btn primary grow" onClick={save}>
            保存
          </button>
        </>
      }
    >
      {f.sourceName && (
        <p className="synced-note">
          🏷️ <b>{f.sourceName}</b> から取り込んだ予定です（デモの見本）。
        </p>
      )}
      <label className="field">
        <span>名前</span>
        <input value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder={f.kind === 'off' ? 'お休み' : '例：運動会、歯医者'} />
      </label>
      <div className="field">
        <span>だれの予定？</span>
        <MemberPicker members={members} value={f.memberIds} onChange={(v) => set({ memberIds: v })} />
      </div>
      <div className="row2">
        <label className="field">
          <span>日にち</span>
          <input type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} />
        </label>
        <label className="field">
          <span>最終日（複数日のとき）</span>
          <input type="date" value={f.endDate ?? ''} onChange={(e) => set({ endDate: e.target.value || undefined })} />
        </label>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={f.allDay}
          onChange={(e) => set({ allDay: e.target.checked, ...(!existing && !remTouched ? { reminders: defaultReminders(e.target.checked) } : {}) })}
        />{' '}
        終日
      </label>
      {!f.allDay && (
        <div className="row2">
          <label className="field">
            <span>始まり</span>
            <input type="time" value={f.startTime ?? ''} onChange={(e) => set({ startTime: e.target.value })} />
          </label>
          <label className="field">
            <span>終わり</span>
            <input type="time" value={f.endTime ?? ''} onChange={(e) => set({ endTime: e.target.value })} />
          </label>
        </div>
      )}
      <label className="check">
        <input type="checkbox" checked={f.kind === 'off'} onChange={(e) => set({ kind: e.target.checked ? 'off' : 'event' })} /> お休みの日（会社の休みなど）
      </label>
      <label className="check">
        <input type="checkbox" checked={f.repeat === 'yearly'} onChange={(e) => set({ repeat: e.target.checked ? 'yearly' : undefined })} /> 🔄 毎年繰り返す（誕生日・記念日など）
      </label>
      {f.repeat === 'yearly' && f.date && (
        <p className="synced-note">
          🔄 毎年、<b>{Number(f.date.slice(5, 7))}月{Number(f.date.slice(8, 10))}日</b>に出ます（{f.date.slice(0, 4)}年から）。ここで直したり消したりすると、<b>すべての年</b>の予定に反映されます。
        </p>
      )}
      {f.kind !== 'off' && <p className="muted">※ 通知は、本物の版ではスマホに届きます。デモ版では届きません（選び方の見本です）。</p>}
      {f.kind !== 'off' && (
        <ReminderEditor
          value={f.reminders ?? []}
          allDay={f.allDay}
          onChange={(v) => {
            setRemTouched(true);
            set({ reminders: v.length ? v : undefined });
          }}
        />
      )}
      <label className="field">
        <span>メモ</span>
        <textarea rows={3} value={f.note ?? ''} onChange={(e) => set({ note: e.target.value || undefined })} />
      </label>
      {err && <p className="error">{err}</p>}
    </Sheet>
  );
};
