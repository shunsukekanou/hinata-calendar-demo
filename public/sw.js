// デモ版の小さな「サービスワーカー」。
// ホーム画面に追加できる条件（Chrome）のために置いてある。画面の保存（キャッシュ）や通知は、しない。
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
