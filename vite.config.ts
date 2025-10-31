import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  // Add base configuration for proper deployment
  base: '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      disable: process.env.NODE_ENV === 'development',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'CRM Lead Management',
        short_name: 'CRM',
        description: 'Professional CRM system for lead management and team collaboration',
        theme_color: '#6366f1',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable any'
          },
          {
            src: 'tab.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any'
          }
        ],
        shortcuts: [
          {
            name: 'Create Lead',
            short_name: 'New Lead',
            description: 'Create a new lead',
            url: '/dashboard/leads/create',
            icons: [{ src: 'icon.svg', sizes: 'any' }]
          },
          {
            name: 'View Dashboard',
            short_name: 'Dashboard',
            description: 'View your dashboard',
            url: '/dashboard',
            icons: [{ src: 'icon.svg', sizes: 'any' }]
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{css,html,ico,svg,json,js}'],
        globIgnores: ['**/*.ts', '**/*.tsx', '**/node_modules/**'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB limit
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              }
            }
          },
          {
            urlPattern: /\.(js|mjs)$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'js-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 1 week
              }
            }
          },
          {
            urlPattern: /\.(ts|tsx)$/i,
            handler: 'NetworkOnly',
            options: {
              cacheName: 'ts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 // 1 hour
              }
            }
          }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    // Add proper MIME type handling for development
    cors: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
    // Dynamic proxy configuration for WhatsApp API to avoid CORS issues
    proxy: {
      '/api/whatsapp': {
        target: 'http://20.46.233.188:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/whatsapp/, '/check'),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            // Add CORS headers
            proxyReq.setHeader('Access-Control-Allow-Origin', '*');
            proxyReq.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            proxyReq.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
          });
        }
      },
      '/api/bulk-dnc': {
        target: 'https://us-central1-crms-4f543.cloudfunctions.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/bulk-dnc/, '/bulkDNCImport'),
        secure: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            // Add CORS headers
            proxyReq.setHeader('Access-Control-Allow-Origin', '*');
            proxyReq.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            proxyReq.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
          });
        }
      }
    }
  },
  build: {
    // Ensure proper module format
    target: 'esnext',
    minify: 'terser', // Use terser for better obfuscation
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log in production
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.warn']
      },
      // Important: Do not mangle top-level or properties to avoid breaking React/runtime across chunks
      mangle: false
    },
    rollupOptions: {
      output: {
        // Improve chunk splitting for better loading
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom'],
          ui: ['lucide-react', 'framer-motion'],
          utils: ['date-fns', 'clsx'],
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore']
        },
        // Ensure proper file extensions for modules
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },
    chunkSizeWarningLimit: 1000,
    // Disable source maps in production for security
    sourcemap: false
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
    include: ['react', 'react-dom', 'react-router-dom']
  },
  // Add resolve configuration for better module resolution
  resolve: {
    alias: {
      '@': '/src'
    }
  }
});