import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        auth: 'auth.html',
        app: 'app.html',
        explore: 'explore.html',
        chat: 'chat.html',
        profile: 'profile.html',
        careers: 'careers.html',
      },
    },
  },
});
