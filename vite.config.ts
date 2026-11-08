import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' ＝ 置き場所（GitHub Pages のように、住所の途中に名前が入る場所）が変わっても動くようにする
// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173 },
})
