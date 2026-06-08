/// <reference types="vitest/config" />
import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

// Use vite's own loadEnv() rather than process.env so .env / .env.local are
// picked up regardless of how the dev server is launched. Bun, in particular,
// does not inject .env* into the child process when running a package.json
// script via `bun run dev`, which silently broke the dev proxy by falling
// back to localhost:3000 even when the user had VITE_API_TARGET set in
// .env.local pointing at their actual backend port.
export default defineConfig(({ mode }) => {
  // Empty prefix loads ALL keys (not just VITE_*), so APP_PORT and friends
  // from the root .env are also available if the config ever needs them.
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_TARGET || 'http://localhost:3000'

  return {
    plugins: [
      TanStackRouterVite({
        routesDirectory: './src/routes',
        generatedRouteTree: './src/routeTree.gen.ts',
      }),
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: Number(env.VITE_PORT) || 5173,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/v1': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 1000,
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      exclude: ['node_modules', 'dist', 'src/routeTree.gen.ts'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        exclude: [
          'src/routeTree.gen.ts',
          'src/main.tsx',
          'src/test/**',
          'src/**/*.{test,spec}.{ts,tsx}',
          '**/*.config.*',
        ],
      },
    },
  }
})
