import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger(), mcpPlugin()].filter(Boolean),

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query"],
  },
  build: {
    // Hide source code in production: no sourcemaps, aggressive minification,
    // strip console + debugger statements so the served JS is opaque.
    sourcemap: false,
    minify: "esbuild",
    target: "es2020",
    cssCodeSplit: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // Split heavy third-party code out of the entry chunk so the landing
        // route only parses what it needs to paint the hero. No catch-all
        // "vendor" bucket here — that would re-merge lazy route dependencies
        // into a single chunk the entry HTML preloads, undoing the splitting.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/.test(id)) {
            return "react-vendor";
          }
          if (id.includes("@supabase")) return "supabase-vendor";
          if (id.includes("@radix-ui")) return "radix-vendor";
          if (id.includes("@tanstack")) return "query-vendor";
          // three/@react-three are intentionally NOT named here: forcing them
          // into a manual chunk makes that chunk a static dependency of the
          // entry (Vite then modulepreloads ~800 kB on the homepage). Left
          // unnamed, Rollup keeps them inside the lazy MoodOrb chunk.

          if (id.includes("web-audio-beat-detector")) return "audio-vendor";
        },
        // Hashed filenames make it harder to map bundles back to source paths.
        entryFileNames: "assets/[hash].js",
        chunkFileNames: "assets/[hash].js",
        assetFileNames: "assets/[hash][extname]",
      },
    },


  },
  esbuild: {
    // Strip console.* and debugger from production bundles only.
    drop: mode === "production" ? ["console", "debugger"] : [],
    legalComments: "none",
  },
}));
