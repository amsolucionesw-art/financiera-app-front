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
})

