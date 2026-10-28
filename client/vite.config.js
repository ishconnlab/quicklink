import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:4000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:4000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // LiveKit's prebuilt ESM bundle is ~578 kB raw but ~151 kB gzipped.
    // Keep the warning for unexpectedly larger bundles while allowing this
    // known media dependency bundle through.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('/node_modules/')) return undefined;
          if (id.includes('/livekit-client/')) return 'livekit';
          if (id.includes('/socket.io-client/') || id.includes('/engine.io-client/') || id.includes('/engine.io-parser/') || id.includes('/socket.io-parser/')) return 'realtime';
          return 'vendor';
        },
      },
    },
  },
});
