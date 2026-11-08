// 「はじめの設定」（初めて開いたときの案内）の記録と、ホーム画面への追加
//
// ・はじめの設定を済ませたか、このスマホを使う人はだれか、を、この端末の中（localStorage）に覚える。
// ・ホーム画面への追加は、ウェブサイト側から勝手には追加できない（ブラウザの決まり）。
//   Android（Chrome）：ブラウザが「追加できます」と知らせてくれたとき（beforeinstallprompt）に限り、ボタン1つで追加の確認を出せる。
//   iPhone（Safari）：そうした仕組みがないため、手順を見せるだけ。
const KEY = 'hinata_onboarding_v1';
const SNOOZE_KEY = 'hinata_onboarding_snooze'; // 「あとで」（この回のブラウザを閉じるまで）

export interface OnboardingState {
  done: boolean;
  who?: string; // このスマホを使う人（member の id）
}

export function loadOnboarding(): OnboardingState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const j = JSON.parse(raw) as Partial<OnboardingState>;
      return { done: j.done === true, who: typeof j.who === 'string' ? j.who : undefined };
    }
  } catch {
    // 読めなければ、まだ済んでいない
  }
  return { done: false };
}

export function saveOnboarding(s: OnboardingState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // 保存できなくても、今回の画面では使える
  }
}

export const isSnoozed = (): boolean => {
  try {
    return sessionStorage.getItem(SNOOZE_KEY) === '1';
  } catch {
    return false;
  }
};

export const snooze = () => {
  try {
    sessionStorage.setItem(SNOOZE_KEY, '1');
  } catch {
    // 覚えられなくても、閉じるだけ
  }
};

/** ホーム画面のアプリとして開いているか */
export const isStandalone = (): boolean =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches === true || (navigator as { standalone?: boolean }).standalone === true);

export const isIos = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

/**
 * LINE・Instagram などのアプリの中の簡易画面（アプリ内ブラウザ／WebView）で開いているか。
 * ここでは、ホーム画面への追加も、通知もできないため、ChromeまたはSafariで開き直してもらう。
 *   ・アプリ名の印（Line/・FBAN・Instagram など）、または Android の WebView の印（; wv)）
 *   ・iPhone：Safari の印（Safari/）も、Chrome・Firefox・Edge の印もない（ホーム画面のアプリは除く）
 * ※ 各アプリの実機での判定は、確認できていない（一般的な印をもとにした判定）。
 */
const IN_APP_UA = /\bLine\/|FBAN|FBAV|FB_IAB|Instagram|MicroMessenger|KAKAOTALK|Twitter|; wv\)/i;
export function isInAppBrowser(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent, standalone: boolean = isStandalone()): boolean {
  if (standalone) return false;
  if (IN_APP_UA.test(ua)) return true;
  return /iPhone|iPad|iPod/.test(ua) && !/Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

// ---- ホーム画面への追加（Android の Chrome など） ----
// ブラウザが「追加できます」（beforeinstallprompt）と知らせてくるまでに、少し時間がかかる（画面を開いた直後・読み込み直した直後）。
// その間は「準備しています」と待たせる。ただし、いつまでも待たせないよう、画面を開いてから INSTALL_WAIT_MS で待ちを打ち切る
// （そのブラウザは、ボタンでの追加に対応していない可能性があるため、メニューからの追加を案内する）。
const PAGE_START = Date.now();
export const INSTALL_WAIT_MS = 12000;
/** 追加の準備待ちの残り時間（ミリ秒）。0 なら、待ちを終えた */
export const installWaitLeftMs = (): number => Math.max(0, INSTALL_WAIT_MS - (Date.now() - PAGE_START));

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

/** アプリの起動時に1回だけ呼ぶ。ブラウザが「追加できます」と知らせてくる合図を、取っておく */
export function initInstallCapture() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // ブラウザの自動の案内は出さず、こちらの画面のボタンで出す
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    notify();
  });
}

export const canPromptInstall = (): boolean => deferred !== null;
export const wasInstalled = (): boolean => installed;

export function subscribeInstall(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** 「ホーム画面に追加」の確認を出す（ボタンを押した直後に呼ぶこと） */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const d = deferred;
  if (!d) return 'unavailable';
  deferred = null;
  try {
    await d.prompt();
    const r = await d.userChoice;
    notify();
    return r.outcome;
  } catch {
    notify();
    return 'unavailable';
  }
}
