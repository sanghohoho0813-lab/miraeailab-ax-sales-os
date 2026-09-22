import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 미래AI랩 기존 프로젝트(홈페이지·운영 OS)와 같은 구성: Vite + React + Tailwind v4 플러그인.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5175 },
  preview: { port: 4175 },
})
