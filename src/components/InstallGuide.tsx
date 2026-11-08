import React, { useEffect, useState } from 'react';
import { canPromptInstall, installWaitLeftMs, isInAppBrowser, isIos, isStandalone, promptInstall, subscribeInstall, wasInstalled } from '../utils/onboarding';

// 「ホーム画面に追加」の案内の部品（はじめの設定と、⚙️設定で共用）
//
//   状態（InstallState）
//     done        ＝すでに追加済み（ホーム画面のアプリとして開いている／いま追加した）
//     ready       ＝ブラウザが「追加できます」と知らせてきた → ボタン1つで、スマホの追加の確認を出せる
//     waiting     ＝ブラウザの知らせを待っている（開いた直後・読み込み直した直後）→「準備しています」と待たせる
//     unavailable ＝待ったが知らせが来なかった／キャンセルされた → メニューからの追加を案内する
//     ios         ＝iPhone の Safari など（ボタンでは追加できない）→ 手順を見せる
//     inapp       ＝LINE などのアプリの中の簡易画面 → ChromeまたはSafariで開き直してもらう
export type InstallState = 'done' | 'ready' | 'waiting' | 'unavailable' | 'ios' | 'inapp';

export function useInstallState() {
  const [, force] = useState(0);
  const [accepted, setAccepted] = useState(false);
  const [used, setUsed] = useState(false); // 追加の確認を一度出した（キャンセルされた）あとは、「準備しています」には戻さない
  useEffect(() => subscribeInstall(() => force((n) => n + 1)), []);
  const standalone = isStandalone();
  const installedNow = accepted || wasInstalled();
  let state: InstallState;
  if (standalone || installedNow) state = 'done';
  else if (isInAppBrowser()) state = 'inapp';
  else if (isIos()) state = 'ios';
  else if (canPromptInstall()) state = 'ready';
  else if (!used && installWaitLeftMs() > 0) state = 'waiting';
  else state = 'unavailable';

  // 待ちが終わる時刻になったら、描き直す（「準備しています」→「メニューから追加」へ）
  useEffect(() => {
    if (state !== 'waiting') return;
    const t = window.setTimeout(() => force((n) => n + 1), installWaitLeftMs() + 50);
    return () => window.clearTimeout(t);
  }, [state]);

  /** スマホの「ホーム画面に追加しますか？」を出す（ボタンを押した直後に呼ぶ） */
  const install = async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    const r = await promptInstall();
    if (r === 'accepted') setAccepted(true);
    else setUsed(true);
    return r;
  };
  return { state, install, standalone, installedNow };
}

/** 準備待ち（スピナー） */
export const InstallPreparing: React.FC = () => (
  <p className="install-wait" role="status">
    <span className="onb-spin" aria-hidden="true">
      🔄
    </span>{' '}
    アプリの追加を準備しています…（数秒かかります）
  </p>
);

/** 追加成功の、大きな表示 */
export const InstallSuccess: React.FC = () => (
  <div className="install-success" role="status">
    <div className="install-success-mark" aria-hidden="true">
      🎉
    </div>
    <b>アプリをホーム画面に追加しました！</b>
  </div>
);

/** メニューからの追加の案内（ボタンが使えないブラウザ向け） */
export const MenuInstallGuide: React.FC = () => (
  <>
    <p>
      ブラウザのメニュー（右上の「⋮」）から、<b>「ホーム画面に追加」</b>または<b>「アプリをインストール」</b>を選んでください。
    </p>
    <p className="muted">すでに追加済みのときは、ホーム画面のアイコンから開いてください。追加しない場合は、そのまま進めます。</p>
  </>
);

/** iPhone：追加の手順 */
export const IosInstallSteps: React.FC = () => (
  <>
    <p>iPhone では、次の順番で、ホーム画面に追加します。</p>
    <ol className="steps">
      <li>
        画面の下（または上）の <b>「共有」ボタン</b>（四角から上向きの矢印のマーク）を押します。
      </li>
      <li>
        出てきた一覧から <b>「ホーム画面に追加」</b> を選びます。
      </li>
      <li>
        右上の <b>「追加」</b> を押します。
      </li>
      <li>
        <b>ホーム画面にできたアイコンから、開き直します。</b>続きの設定（通知など）は、そのアイコンから開いたときに行います。
      </li>
    </ol>
    <div className="notice">ℹ iPhone では、ホーム画面のアイコンから開かないと、通知を受け取れません。</div>
  </>
);

/** アプリ内ブラウザ（LINE・QR リーダーなどの簡易画面）で開いているときの注意 */
export const InAppNotice: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const address = `${window.location.origin}/`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="notice warn inapp-notice" role="alert">
      <b>⚠️ 専用ブラウザ（ChromeまたはSafari）で開いてください</b>
      <p>いま開いているのは、LINE などのアプリの中の簡易画面です。ここでは、ホーム画面への追加も、通知も、うまく動きません。</p>
      <ol className="steps">
        <li>画面の右上（または下）のメニュー（「⋮」や共有のマークなど）を押します。</li>
        <li>
          <b>「ブラウザで開く」</b>を選びます。（アプリによって、「Chromeで開く」「Safariで開く」「他のアプリで開く」など、名前が少し違います）
        </li>
      </ol>
      <p className="muted">メニューの場所や名前は、お使いのアプリによって違います（アプリごとの表示は、確認できていません）。見つからないときは、下のボタンでアドレスをコピーして、ChromeまたはSafariのアドレス欄に貼り付けて開いてください。</p>
      <button type="button" className="btn full" onClick={copy}>
        {copied ? 'コピーしました。ChromeまたはSafariに貼り付けてください' : 'このアプリのアドレスをコピー'}
      </button>
    </div>
  );
};
