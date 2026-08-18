import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

/* В разработке клиент живёт на 5173, сервер на 8787.
   Вебсокет и статику проксируем, чтобы код клиента не знал про порты. */
export default defineConfig({
  plugins: [vue()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/ws': { target: 'ws://localhost:8787', ws: true }
    }
  },
  build: { outDir: 'dist', emptyOutDir: true }
});
