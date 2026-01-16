import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Evita dobles copias de React en el bundle
  resolve: {
    dedupe: ['react', 'react-dom']
  },

  plugins: [
    react(),
    tailwindcss()
  ],

  /**
   * Netlify estaba construyendo con targets tipo "es2020/chrome87"
   * y eso NO soporta top-level await.
   * Subimos el target para permitirlo.
   */
  build: {
    target: 'es2022'
  },

  esbuild: {
    target: 'es2022'
  }
})
