import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initInstallCapture } from './utils/onboarding'

// ホーム画面への追加の合図を取っておく／通知とホーム画面追加のための、小さなサービスワーカーを登録する
initInstallCapture()
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // 登録できなくても、アプリは今までどおり使える
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
