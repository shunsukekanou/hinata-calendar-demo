import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarPlus, ChevronLeft, Download, FileUp, Image as ImageIcon, Save } from 'lucide-react';
import { FATHER_ID, eventsOn, useStore } from '../store';
import { Sheet, MemberPicker } from './Sheets';
import { draftToEvent, parseIcsReport } from '../utils/ics';
import type { IcsDraft, IcsReport } from '../utils/ics';
import { isTimeTreeText, parseTimeTreeText } from '../utils/timetreeText';
import { extractTimeTreeMonths } from '../utils/timetreeExtract';
import { formatDate, generateCalendarGrid, weekdayHeaders } from '../utils/holidayUtils';
import { googleSample, samplePacks } from '../demoData';
import type { SamplePack } from '../demoData';

export const ImportSheets: React.FC = () => {
  const { importOpen } = useStore();
  if (!importOpen) return null;
  if (importOpen === 'sync') return <SampleSheet />;
  if (importOpen === 'google') return <GoogleDemoSheet />;
  if (importOpen === 'file') return <FileMenuSheet />;
  if (importOpen === 'ics') return <IcsSheet />;
  if (importOpen === 'image') return <ImageSheet />;
  if (importOpen === 'backup') return <BackupSheet />;
  return <MenuSheet />;
};

// 「戻る」（取り込みの入口へ／ファイル取り込みの入口へ）
const BackLink: React.FC<{ to: 'menu' | 'file' }> = ({ to }) => {
  const { openImport } = useStore();
  return (
    <button className="back-link" onClick={() => openImport(to)}>
      <ChevronLeft size={18} /> {to === 'menu' ? '取り込みメニューへ戻る' : 'ファイル取り込みへ戻る'}
    </button>
  );
};

// ---- 入口：自動同期 と ファイル取り込み の2つ ----
const MenuSheet: React.FC = () => {
  const { openImport } = useStore();
  return (
    <Sheet title="取り込み・同期" onClose={() => openImport(null)}>
      <p className="muted">予定を入れる方法は3つあります。まずは「Googleカレンダーと同期」か「サンプル予定の取り込み」を試してください。</p>
      <button className="cat-card" onClick={() => openImport('google')}>
        <span className="cat-icon">🔄</span>
        <span className="cat-body">
          <b>Googleカレンダーと同期（デモの見本）</b>
          <small>本物の版では、ボタン1つで最新の予定を反映します。デモでは架空の予定で体験できます。</small>
          <span className="cat-apps">
            <i>Googleカレンダー</i>
          </span>
        </span>
      </button>
      <button className="cat-card" onClick={() => openImport('sync')}>
        <span className="cat-icon">✨</span>
        <span className="cat-body">
          <b>サンプル予定の取り込み（体験）</b>
          <small>部活・習い事・PTA/自治会の予定を、ボタン1つで取り込みます。</small>
          <span className="cat-apps">
            <i>TimeTree</i>
            <i>サッカー少年団</i>
            <i>PTA・自治会</i>
          </span>
        </span>
      </button>
      <button className="cat-card" onClick={() => openImport('file')}>
        <span className="cat-icon">📥</span>
        <span className="cat-body">
          <b>ファイル取り込み</b>
          <small>ファイルや写真から、予定を入れます。</small>
          <span className="cat-apps">
            <i>TimeTree</i>
            <i>学校プリントの写真</i>
            <i>バックアップ</i>
          </span>
        </span>
      </button>
    </Sheet>
  );
};

// ---- ファイル取り込みの入口 ----
const FileMenuSheet: React.FC = () => {
  const { openImport } = useStore();
  return (
    <Sheet title="ファイル取り込み" onClose={() => openImport(null)}>
      <BackLink to="menu" />
      <button className="menu-item" onClick={() => openImport('ics')}>
        <CalendarPlus size={26} />
        <span>
          <b>TimeTree（パソコンの画面から）・.ics ファイル</b>
          <small>TimeTree の月の画面を読み取る／.ics ファイルを読み込む</small>
        </span>
      </button>
      <button className="menu-item" onClick={() => openImport('image')}>
        <ImageIcon size={26} />
        <span>
          <b>画像から登録</b>
          <small>学校の予定プリント・会社のカレンダーを見ながら入れる</small>
        </span>
      </button>
      <button className="menu-item" onClick={() => openImport('backup')}>
        <Save size={26} />
        <span>
          <b>バックアップ</b>
          <small>予定をファイルに保存する・戻す</small>
        </span>
      </button>
      <p className="muted">TimeTree の予定を、他のカレンダーへ自動で反映する方法は、TimeTree の公式ヘルプでは案内されていません（連携は、他のカレンダー → TimeTree の一方向だけです）。そのため、パソコンの TimeTree の画面を読み取る方法を用意しました（手動で、月ごとに行います）。Google・Apple・Outlook は、本物の版では、カレンダーの URL を登録する「自動同期」のほうが手間がかかりません（デモ版では外しています）。</p>
    </Sheet>
  );
};

// ---- Googleカレンダーと同期（デモの見本）----
// 本物の版では、Google にログインして予定を取り込む。デモ版は Google には一切つながず、架空の予定を入れるだけ。
const GoogleDemoSheet: React.FC = () => {
  const { openImport, importEvents, events } = useStore();
  const list = useMemo(() => googleSample(), []);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState('');
  const done = list.every((e) => events.some((x) => x.uid === e.uid));
  const run = () => {
    setBusy(true);
    window.setTimeout(() => {
      const n = importEvents(list);
      const d = new Date();
      setLast(`${n}件の予定を同期しました（${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}）`);
      setBusy(false);
    }, 900);
  };
  return (
    <Sheet title="Googleカレンダーと同期" onClose={() => openImport(null)}>
      <BackLink to="menu" />
      <div className="notice">ℹ これは<b>デモの見本</b>です。本物の Google にはつながらず、架空の予定を取り込みます。</div>
      <div className="cat-card" style={{ cursor: 'default' }}>
        <span className="cat-icon">📅</span>
        <span className="cat-body">
          <b>たかしのGoogleカレンダー（架空）</b>
          <b>みさきのGoogleカレンダー（架空）</b>
          <small>歯医者・同期の飲み会・ヨガ教室など</small>
          <span className="cat-apps">
            <i>{list.length}件</i>
            <i>{done ? '同期済み' : '未同期'}</i>
          </span>
        </span>
      </div>
      <button className="btn primary full" disabled={busy} onClick={run}>
        {busy ? '同期しています…' : '🔄 今すぐ同期する'}
      </button>
      {(last || done) && <div className="notice">✅ {last || '同期済みです。「月」の画面で、🏷️ のついた予定を確かめてください。'}</div>}
      <p className="muted">本物の版では、Google にログインして、自分のカレンダーを選ぶだけで、ボタン1つで最新の予定が入ります。登録したあとは、自動でも最新になります。</p>
    </Sheet>
  );
};

// ---- サンプル予定の取り込み体験（デモ版）----
// 本物の版では、Google・Apple・Outlook のカレンダーの URL を登録して、ボタン1つで最新の予定を反映している。
// デモ版では外部のサービスにはつながず、見本の予定を、ボタン1つで取り込めるようにしてある。
const SampleSheet: React.FC = () => {
  const { openImport, importEvents, events } = useStore();
  const packs = useMemo(() => samplePacks(), []);
  const [msg, setMsg] = useState('');
  const isIn = (p: SamplePack) => p.events.every((e) => events.some((x) => x.uid === e.uid));
  const run = (list: SamplePack[]) => {
    const todo = list.filter((p) => !isIn(p));
    if (!todo.length) return;
    const n = importEvents(todo.flatMap((p) => p.events));
    setMsg(`${n}件の予定を取り込みました。「月」や「タイムライン」の画面で、家族それぞれの予定が1つのカレンダーにまとまったことを確かめてください。`);
  };
  const left = packs.filter((p) => !isIn(p));
  return (
    <Sheet title="サンプル予定の取り込み" onClose={() => openImport(null)}>
      <BackLink to="menu" />
      <p className="muted">家族それぞれが入っているコミュニティ（部活・習い事・PTA/自治会）の予定を、ボタン1つで、このカレンダーに取り込む体験です。すべて架空の予定です。</p>
      {packs.map((p) => {
        const done = isIn(p);
        return (
          <button key={p.id} className="cat-card" disabled={done} onClick={() => run([p])}>
            <span className="cat-icon">{p.icon}</span>
            <span className="cat-body">
              <b>
                {p.title}（{p.who}）
              </b>
              <small>{p.desc}</small>
              <span className="cat-apps">
                <i>{p.from}</i>
                <i>{p.events.length}件</i>
              </span>
              <small style={{ color: done ? '#2e7d32' : 'var(--accent, #c8743b)', fontWeight: 700 }}>{done ? '✓ 取り込み済み' : '▶ タップして取り込む'}</small>
            </span>
          </button>
        );
      })}
      {left.length > 1 && (
        <button className="btn primary full" onClick={() => run(left)}>
          ✨ 残りをまとめて取り込む
        </button>
      )}
      {msg && <div className="notice">✅ {msg}</div>}
      <p className="muted">
        本物の版では、Google・Apple・Outlook のカレンダーの予定を、ボタン1つで自動で反映します。このデモ版は、外部のサービスにはつながず、予定はこの端末のブラウザの中だけに保存されます。
      </p>
    </Sheet>
  );
};


// ---- .ics ----
// 予定の題名や日付に、探す言葉が入っているか（日付は「10/17」「10月17日」「2026-10-17」のどれでも探せる）
const matchesQuery = (d: IcsDraft, q: string) => {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const [, m, day] = d.date.split('-');
  const dates = [d.date, `${Number(m)}/${Number(day)}`, `${m}/${day}`, `${Number(m)}月${Number(day)}日`, `${Number(m)}-${Number(day)}`];
  return d.title.toLowerCase().includes(s) || dates.some((x) => x.includes(s));
};

// TimeTree のページで押す「ブックマーク」の中身。画面の予定を読み取って、コピーする
const bookmarkletUrl = () =>
  'javascript:' +
  encodeURIComponent(
    `(function(){var n=parseInt(prompt('何か月分、読み取りますか？（いま出ている月から、先の月へ。1〜12）','3'),10);if(!n)return;var d=document.createElement('div');d.style.cssText='position:fixed;z-index:2147483647;left:5%;top:5%;width:90%;background:#fff;color:#000;padding:12px;border:3px solid #16a34a;font:14px sans-serif';var m=document.createElement('div');m.style.marginBottom='6px';m.textContent='読み取り中です…（月を切り替えながら読みます。そのままお待ちください）';var a=document.createElement('textarea');a.style.cssText='width:100%;height:200px;color:#000;background:#fff';var c=document.createElement('button');c.textContent='コピー';c.style.marginRight='8px';c.onclick=function(){a.select();var ok=false;try{ok=document.execCommand('copy')}catch(e){}m.textContent=ok?'コピーしました。ひなた家カレンダーに戻って、貼り付けてください。':'うまくコピーできません。枠の中の文字を、全部コピー（Ctrl+A → Ctrl+C）してください。'};var b=document.createElement('button');b.textContent='閉じる';b.onclick=function(){d.remove()};d.appendChild(m);d.appendChild(a);d.appendChild(c);d.appendChild(b);document.body.appendChild(d);(${extractTimeTreeMonths.toString()})(n).then(function(t){a.value=t;a.select();var ok=false;try{ok=document.execCommand('copy')}catch(e){}m.textContent=ok?'コピーしました。ひなた家カレンダーに戻って、貼り付けてください。':'読み取れました。下の「コピー」ボタンを押してから、ひなた家カレンダーに貼り付けてください。'}).catch(function(e){m.textContent='うまく読み取れませんでした：'+e})})();`
  );

const IcsSheet: React.FC = () => {
  const { openImport, members, importEvents } = useStore();
  const [report, setReport] = useState<IcsReport | null>(null);
  const [drafts, setDrafts] = useState<IcsDraft[] | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set()); // 取り込まない（チェックを外した）予定
  const [msg, setMsg] = useState('');
  const [showPast, setShowPast] = useState(false);
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [q, setQ] = useState('');
  const [pasted, setPasted] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  // アプリとして入れた画面（ブックマークバーがない）で開いているか
  const standalone =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: window-controls-overlay)').matches || (navigator as { standalone?: boolean }).standalone === true);
  const [copied, setCopied] = useState(false);
  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin + window.location.pathname);
      setCopied(true);
    } catch {
      setMsg('コピーできませんでした。アドレスは ' + window.location.origin + window.location.pathname + ' です。');
    }
  };
  const fileRef = useRef<HTMLInputElement>(null);
  const bmRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    // React は javascript: のリンクを書かせないため、ここで直接つける
    bmRef.current?.setAttribute('href', bookmarkletUrl());
  }, [drafts]);

  const showReport = (rep: IcsReport, emptyMsg: string) => {
    setReport(rep);
    setOff(new Set(rep.drafts.filter((d) => d.skip).map((d) => d.key)));
    setShowPast(false);
    setOnlyUnassigned(false);
    setQ('');
    setMsg(rep.drafts.length === 0 ? emptyMsg : '');
    setDrafts(rep.drafts.length ? rep.drafts : null);
  };

  // 貼り付けた文字から読み取る（TimeTree の画面から取り出した文字、または .ics の中身）
  const onPaste = () => {
    const text = pasted.trim();
    if (!text) {
      setMsg('貼り付ける文字が空です。');
      return;
    }
    if (isTimeTreeText(text)) {
      const rep = parseTimeTreeText(text, members);
      setNotes(rep.notes);
      showReport(rep, rep.notes[0] ?? '予定が見つかりませんでした。');
      return;
    }
    if (/BEGIN:VCALENDAR/i.test(text)) {
      setNotes([]);
      const rep = parseIcsReport(text, members);
      showReport(rep, '取り込める予定がありませんでした。');
      return;
    }
    setMsg('読み取れない文字です。TimeTree のページで、ブックマークを押してコピーした文字を貼り付けてください。');
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    try {
      const text = await file.text();
      const rep = parseIcsReport(text, members);
      setNotes([]);
      setReport(rep);
      setOff(new Set());
      setShowPast(false);
      setOnlyUnassigned(false);
      setQ('');
      if (rep.totalEvents === 0) {
        setMsg('予定が見つかりませんでした。.ics ファイルか確かめてください。');
        setDrafts(null);
        return;
      }
      setMsg(rep.drafts.length === 0 ? '取り込める予定がありませんでした。読めなかった予定の理由を、下に出しています。' : '');
      setDrafts(rep.drafts.length ? rep.drafts : null);
    } catch {
      setMsg('ファイルを読めませんでした。');
    }
  };

  const setMembers = (key: string, ids: string[]) =>
    setDrafts((p) => p && p.map((d) => (d.key === key ? { ...d, memberIds: ids, matched: ids.length > 0 } : d)));

  const doImport = () => {
    if (!drafts) return;
    const pick = drafts.filter((d) => !off.has(d.key));
    const n = importEvents(
      pick.map((d) => {
        const { id: _id, ...rest } = draftToEvent(d, '');
        void _id;
        return rest;
      })
    );
    setMsg(`${n}件を取り込みました。`);
    setDrafts(null);
    setReport(null);
  };

  const monthStart = formatDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const visible = (drafts ?? []).filter((d) => (showPast || d.date >= monthStart) && (!onlyUnassigned || d.memberIds.length === 0) && matchesQuery(d, q));
  const pastCount = (drafts ?? []).filter((d) => d.date < monthStart).length;
  const unassignedVisible = visible.filter((d) => d.memberIds.length === 0 && !off.has(d.key));
  const unassignedAll = (drafts ?? []).filter((d) => d.memberIds.length === 0).length;
  const matchedCount = drafts?.filter((d) => d.matched).length ?? 0;
  const importCount = drafts ? drafts.length - drafts.filter((d) => off.has(d.key)).length : 0;
  const assignAll = (id: string) => {
    const keys = new Set(unassignedVisible.map((d) => d.key));
    setDrafts((p) => p && p.map((d) => (keys.has(d.key) ? { ...d, memberIds: [id], matched: true } : d)));
  };
  const nameOf = (d: IcsDraft) => (d.memberIds.length === 0 ? '' : d.memberIds.map((id) => members.find((m) => m.id === id)?.name ?? '').filter(Boolean).join('・'));

  return (
    <Sheet
      wide
      title="TimeTree・カレンダーファイルの取り込み"
      onClose={() => openImport(null)}
      footer={
        drafts ? (
          <>
            <button
              className="btn"
              onClick={() => {
                setDrafts(null);
                setReport(null);
              }}
            >
              やめる
            </button>
            <button className="btn primary grow" onClick={doImport}>
              {importCount}件を取り込む
            </button>
          </>
        ) : undefined
      }
    >
      <input ref={fileRef} type="file" accept=".ics,text/calendar" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      {!drafts && (
        <>
          <BackLink to="file" />
          <h4 className="ics-h">TimeTree の予定を、パソコンの画面から取り込む</h4>
          <ol className="steps">
            <li>
              <b>はじめの1回だけ</b>：この画面を、パソコンの<b>ふつうの Chrome</b>（タブが並んでいて、アドレス欄の下に<b>ブックマークバー</b>がある画面）で開きます。帯が出ていないときは、<b>Ctrl+Shift+B</b>。
              {standalone && (
                <div className="notice">
                  ⚠ いまは、<b>アプリの画面</b>で開いています（ブックマークバーがありません）。右上の「<b>⋮</b>」に「<b>Chrome で開く</b>」があれば、それを押します。なければ、下のボタンでアドレスをコピーして、Chrome のアドレス欄に貼り付けて開いてください。
                  <button className="btn full" type="button" onClick={copyAddress}>
                    {copied ? 'コピーしました' : 'このアプリのアドレスをコピー'}
                  </button>
                </div>
              )}
            </li>
            <li>
              Chrome で開いた、この画面の下の緑の「<b>TimeTree 読み取り</b>」を、<b>ブックマークバーへドラッグして置きます</b>。古い「TimeTree 読み取り」が残っているときは、右クリック →「削除」で消します。
              <div className="bm-row">
                <a ref={bmRef} className="bm-link" draggable onClick={(e) => e.preventDefault()}>
                  TimeTree 読み取り
                </a>
              </div>
            </li>
            <li>
              パソコンで <b>timetreeapp.com</b> を開き、<b>「Monthly（月）」</b>の表示にして、<b>取り込みたい最初の月</b>を出します。
            </li>
            <li>ブックマークの「TimeTree 読み取り」を押します。「何か月分」と聞かれるので、数字（例：3）を入れて OK を押します。数秒たつと、緑の枠に「コピーしました」と出ます（出ないときは、枠の「コピー」ボタンを押します）。</li>
            <li>この画面に戻り、下の枠に<b>貼り付けて</b>（Ctrl+V）、「読み取る」を押します。次の画面で、だれの予定かを直して取り込みます。</li>
          </ol>
          <textarea className="paste-box" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="ここに貼り付け（Ctrl+V）" rows={4} aria-label="TimeTree から読み取った文字" />
          <button className="btn primary full" onClick={onPaste} disabled={!pasted.trim()}>
            貼り付けた文字から読み取る
          </button>
          <div className="notice">
            ℹ TimeTree の予定は、<b>自動では反映されません</b>。足したり直したりしたら、もう一度、この手順で読み取ってください（同じ予定は二重になりません。ただし、TimeTree 側で題名や時刻を直した予定は、別の予定として入るため、古いほうをこのアプリで消してください）。スマホ（Android）からの取り込みは、準備中です。
          </div>
          <h4 className="ics-h">カレンダーのファイル（.ics）から</h4>
          <p className="muted">Google カレンダー：パソコンのブラウザで「設定」→「インポート／エクスポート」→「エクスポート」。（Google は「自動同期」のほうが手間がかかりません）。TimeTree には、.ics を書き出す項目は、確認できていません。</p>
          <button className="btn primary full" onClick={() => fileRef.current?.click()}>
            <FileUp size={18} /> .ics ファイルを選ぶ
          </button>
          <p className="muted">予定の名前・内容・参加者に「たかし・みさき・あおい・りく」が入っていれば、その人の行に自動で振り分けます。入っていないものは「全体（未割り当て）」になるので、次の画面でまとめて直せます。⚙️ 設定で、別名（ローマ字・メールの名前など）も使えます。</p>
          {msg && <p className={msg.includes('取り込みました') ? 'ok' : 'error'}>{msg}</p>}
        </>
      )}

      {report && (
        <div className="ics-summary">
          {notes.map((n, i) => (
            <p key={i} className="error">
              ⚠ {n}
            </p>
          ))}
          <p>
            読み取った予定：<b>{report.totalEvents}件</b> → 取り込める予定：<b>{report.drafts.length}件</b>
            {!('month' in report) && <small>（毎週などの繰り返しは、{report.rangeFrom.slice(0, 7)}〜{report.rangeTo.slice(0, 7)} の分を広げた数）</small>}
            {report.skipped.length > 0 && <> ／ 取り込めなかった予定：<b className="error">{report.skipped.length}件</b></>}
          </p>
          {report.skipped.length > 0 && (
            <details className="howto-box">
              <summary>取り込めなかった予定（{report.skipped.length}件）と、その理由を見る</summary>
              <ul className="skipped-list">
                {report.skipped.slice(0, 200).map((s, i) => (
                  <li key={i}>
                    <b>{s.title}</b>
                    <small>
                      {s.date ? `${s.date}　` : ''}
                      {s.reason}
                    </small>
                  </li>
                ))}
              </ul>
              {report.skipped.length > 200 && <p className="muted">先頭の200件だけ表示しています。</p>}
            </details>
          )}
        </div>
      )}

      {drafts && (
        <>
          <p className="muted">取り込まない予定は、左のチェックを外します。同じファイルをもう一度取り込んでも、二重にはなりません。名前で振り分け済み：{matchedCount}件。</p>

          <div className="ics-tools">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 題名や日付で探す（例：10/17、クリニック）" aria-label="予定を探す" />
            <label className="check">
              <input type="checkbox" checked={onlyUnassigned} onChange={(e) => setOnlyUnassigned(e.target.checked)} />
              <span>「全体（未割り当て）」だけ見る（{unassignedAll}件）</span>
            </label>
            {pastCount > 0 && (
              <label className="check">
                <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} />
                <span>過去の予定（{pastCount}件）も表示する</span>
              </label>
            )}
            {unassignedVisible.length > 0 && (
              <div className="bulk-assign">
                <small>いま表示している、だれの予定か決まっていない{unassignedVisible.length}件を、まとめて：</small>
                <div className="quick-row">
                  {members.map((m) => (
                    <button key={m.id} type="button" className="quick-btn" style={{ '--q': m.color } as React.CSSProperties} onClick={() => assignAll(m.id)}>
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <small className="muted">※ 表示を絞り込んでいても、チェックが入っている予定は、すべて取り込まれます。</small>
          </div>

          <div className="draft-list">
            {visible.length === 0 && <p className="muted">条件に合う予定がありません。</p>}
            {visible.slice(0, 500).map((d) => (
              <div key={d.key} className={`draft ${d.memberIds.length === 0 ? 'unassigned' : ''}`}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={!off.has(d.key)}
                    onChange={(e) =>
                      setOff((p) => {
                        const n = new Set(p);
                        if (e.target.checked) n.delete(d.key);
                        else n.add(d.key);
                        return n;
                      })
                    }
                  />
                  <span className="draft-title">
                    <b>{d.title}</b>
                    <small>
                      {d.date}
                      {d.endDate ? `〜${d.endDate}` : ''} {d.allDay ? '終日' : d.startTime}
                    </small>
                    {d.memberIds.length === 0 ? <em className="badge-unassigned">全体（未割り当て）</em> : <em className="badge-assigned">{nameOf(d)}</em>}
                  </span>
                </label>
                <MemberPicker members={members} value={d.memberIds} onChange={(v) => setMembers(d.key, v)} />
              </div>
            ))}
            {visible.length > 500 && <p className="muted">先頭の500件だけ表示しています（取り込みは全件です）。探す欄や絞り込みを使ってください。</p>}
          </div>
        </>
      )}
    </Sheet>
  );
};

// ---- 画像 ----
const ImageSheet: React.FC = () => {
  const { openImport, members, events, addEvent, setFatherOff, weekStart } = useStore();
  const [url, setUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [tab, setTab] = useState<'school' | 'company'>('school');
  const fileRef = useRef<HTMLInputElement>(null);
  const now = new Date();
  const [y, setY] = useState(now.getFullYear());
  const [m, setM] = useState(now.getMonth() + 1);
  // たかしの休みの変更（保存するまで反映しない）
  const [changes, setChanges] = useState<Record<string, boolean>>({});
  // 学校の予定の入力欄
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [who, setWho] = useState<string[]>([]);
  const [added, setAdded] = useState<string[]>([]);

  const cells = useMemo(() => generateCalendarGrid(y, m, weekStart), [y, m, weekStart]);
  const isOff = (d: string) => (d in changes ? changes[d] : eventsOn(events, d).some((e) => e.kind === 'off' && e.memberIds.includes(FATHER_ID)));
  const move = (n: number) => {
    const d = new Date(y, m - 1 + n, 1);
    setY(d.getFullYear());
    setM(d.getMonth() + 1);
  };
  const saveOff = () => {
    const on = Object.keys(changes).filter((k) => changes[k]);
    const off = Object.keys(changes).filter((k) => !changes[k]);
    if (on.length) setFatherOff(on, true);
    if (off.length) setFatherOff(off, false);
    setChanges({});
    setAdded((p) => [...p, `たかしの休み ${on.length}日を登録、${off.length}日を外しました`]);
  };
  const addSchool = () => {
    if (!title.trim() || !date) return;
    addEvent({ title: title.trim(), date, allDay: true, memberIds: who, kind: 'event', source: 'image' });
    setAdded((p) => [...p, `${date} ${title.trim()}`]);
    setTitle('');
  };

  return (
    <Sheet wide title="画像を見ながら登録" onClose={() => openImport(null)}>
      <BackLink to="file" />
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setUrl(URL.createObjectURL(f)); }} />
      <div className="image-box">
        {url ? (
          <div className="image-scroll">
            <img src={url} alt="読み込んだ画像" style={{ width: `${zoom * 100}%` }} />
          </div>
        ) : (
          <button className="btn full" onClick={() => fileRef.current?.click()}>
            <ImageIcon size={18} /> 写真・画像を選ぶ
          </button>
        )}
        {url && (
          <div className="zoom-row">
            <button className="btn small" onClick={() => setZoom((z) => Math.max(1, z - 0.5))}>縮小</button>
            <button className="btn small" onClick={() => setZoom((z) => Math.min(4, z + 0.5))}>拡大</button>
            <button className="btn small" onClick={() => fileRef.current?.click()}>画像を替える</button>
          </div>
        )}
      </div>
      <div className="tabs2">
        <button className={tab === 'school' ? 'on' : ''} onClick={() => setTab('school')}>学校の予定など</button>
        <button className={tab === 'company' ? 'on' : ''} onClick={() => setTab('company')}>会社の休み（たかし）</button>
      </div>

      {tab === 'school' && (
        <div className="panel">
          <p className="muted">画像を見ながら、1件ずつ入れていきます。続けて何件でも入れられます。</p>
          <label className="field"><span>予定の名前</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例：運動会、授業参観" /></label>
          <label className="field"><span>日にち</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <div className="field"><span>だれの予定？</span><MemberPicker members={members} value={who} onChange={setWho} /></div>
          <button className="btn primary full" disabled={!title.trim() || !date} onClick={addSchool}>この予定を足す</button>
        </div>
      )}

      {tab === 'company' && (
        <div className="panel">
          <p className="muted">会社のカレンダーを見ながら、休みの日をタップします。保存すると「たかしの休み」になります。</p>
          <div className="month-nav small">
            <button className="btn small" onClick={() => move(-1)}>前の月</button>
            <b>{y}年 {m}月</b>
            <button className="btn small" onClick={() => move(1)}>次の月</button>
          </div>
          <div className="mini-grid">
            {weekdayHeaders(weekStart).map((w) => <div key={w.dow} className={`dow ${w.dow === 0 ? 'sun' : w.dow === 6 ? 'sat' : ''}`}>{w.label}</div>)}
            {cells.map((c) => (
              <button
                key={c.dateStr}
                disabled={!c.isCurrentMonth}
                className={`mini-cell ${c.isCurrentMonth ? '' : 'other'} ${isOff(c.dateStr) ? 'off' : ''} ${c.dateStr in changes ? 'changed' : ''}`}
                onClick={() => setChanges((p) => ({ ...p, [c.dateStr]: !isOff(c.dateStr) }))}
              >
                {c.day}
                {isOff(c.dateStr) && <small>休</small>}
              </button>
            ))}
          </div>
          <button className="btn primary full" disabled={Object.keys(changes).length === 0} onClick={saveOff}>
            休みを保存（{Object.keys(changes).length}日の変更）
          </button>
        </div>
      )}
      {added.length > 0 && (
        <ul className="added">{added.slice(-5).map((a, i) => <li key={i}>✓ {a}</li>)}</ul>
      )}
    </Sheet>
  );
};

// ---- バックアップ ----
const BackupSheet: React.FC = () => {
  const { openImport, exportJson, importJson, clearAll, events } = useStore();
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const download = () => {
    const blob = new Blob([exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `家族カレンダー_バックアップ_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setMsg('ファイルを保存しました（ダウンロードフォルダを見てください）。');
  };
  const restore = async (f?: File) => {
    if (!f) return;
    if (!window.confirm('今の予定は、ファイルの内容に置き換わります（家族みんなの画面にも反映されます）。よろしいですか？')) return;
    setMsg(importJson(await f.text()) ? 'もとに戻しました。' : 'このファイルは読めませんでした。');
  };
  return (
    <Sheet title="バックアップ" onClose={() => openImport(null)}>
      <BackLink to="file" />
      <p className="muted">今の予定：{events.length}件。予定はこの端末と、家族で共有するサーバー（Supabase）に保存されます。電波がないときは端末だけに保存し、つながったら自動で送ります。</p>
      <button className="btn primary full" onClick={download}><Download size={18} /> 予定をファイルに保存</button>
      <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => restore(e.target.files?.[0])} />
      <button className="btn full" onClick={() => fileRef.current?.click()}><FileUp size={18} /> ファイルから戻す</button>
      <button
        className="btn danger full"
        onClick={() => {
          if (window.confirm('すべての予定を消します。家族みんなの画面からも消えます。先にバックアップを取りましたか？')) {
            clearAll();
            setMsg('すべて消しました。');
          }
        }}
      >
        すべて消す
      </button>
      {msg && <p className="ok">{msg}</p>}
    </Sheet>
  );
};
