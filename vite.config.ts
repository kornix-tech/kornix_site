import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const devApiProxyTarget = process.env.KORNIX_DEV_API_PROXY_TARGET || process.env.VITE_API_BASE_URL || 'http://localhost:8001';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }
          if (id.includes('/recharts/') || id.includes('/d3-')) {
            return 'vendor-charts';
          }
          if (id.includes('/leaflet/')) {
            return 'vendor-map';
          }
          if (id.includes('/@tanstack/')) {
            return 'vendor-query';
          }
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router-dom/')) {
            return 'vendor-react';
          }
          return undefined;
        }
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: devApiProxyTarget,
        changeOrigin: true,
        secure: false
      }
    }
  }
});
