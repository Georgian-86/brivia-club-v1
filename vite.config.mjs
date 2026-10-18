import { defineConfig } from 'vite';

// The site lives in site/ (pages at its top, so URLs are unchanged); raw originals live in source-media/ (D-065).
export default defineConfig({
  root: 'site',
  envDir: '..',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: 'site/index.html',
        auth: 'site/auth.html',
        app: 'site/app.html',
        explore: 'site/explore.html',
        chat: 'site/chat.html',
        profile: 'site/profile.html',
        careers: 'site/careers.html',
        privacy: 'site/privacy.html',
      },
    },
  },
});
