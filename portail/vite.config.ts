/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Version unique du produit, lue dans le fichier VERSION à la racine (ADR-018).
const version = readFileSync(fileURLToPath(new URL('../VERSION', import.meta.url)), 'utf8').trim();

export default defineConfig({
  plugins: [react()],
  define: { __INNOV_VERSION__: JSON.stringify(version) },
  server: { port: 5173 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
  },
});
