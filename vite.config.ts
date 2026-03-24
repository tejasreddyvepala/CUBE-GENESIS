import { defineConfig } from 'vite'

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/CUBE-GENESIS/' : '/',
  build: {
    target: 'es2020',
  },
})
