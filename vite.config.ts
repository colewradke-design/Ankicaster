import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv, type Plugin} from 'vite';

const DEBUG_STUB = '\0ankicaster-debug-stub';

/**
 * Preview (vite serve) compiles the creature debug panel in.
 * `npm run build:addon` sets VITE_DEBUG_TOOLS=false so the panel module is
 * replaced with an empty stub and cannot appear in addon/web.
 */
function debugToolsPlugin(debugOn: boolean): Plugin {
  return {
    name: 'ankicaster-debug-tools',
    enforce: 'pre',
    resolveId(source) {
      if (debugOn) return null;
      const id = source.replace(/\\/g, '/');
      if (id.includes('CreatureDebugPanel')) return DEBUG_STUB;
      return null;
    },
    load(id) {
      if (id !== DEBUG_STUB) return null;
      return 'export function CreatureDebugPanel(){return null}\n';
    }
  };
}

export default defineConfig(({command, mode}) => {
  const fileEnv = loadEnv(mode, process.cwd(), 'VITE_');
  const explicit = process.env.VITE_DEBUG_TOOLS ?? fileEnv.VITE_DEBUG_TOOLS;
  const debugOn = explicit === 'false' ? false : explicit === 'true' ? true : command === 'serve';
  process.env.VITE_DEBUG_TOOLS = debugOn ? 'true' : 'false';

  return {
    base: './',
    plugins: [react(), tailwindcss(), debugToolsPlugin(debugOn)],
    define: {
      'import.meta.env.VITE_DEBUG_TOOLS': JSON.stringify(debugOn ? 'true' : 'false')
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
