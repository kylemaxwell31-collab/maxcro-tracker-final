import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // This sets the browser target to modern browsers that support import.meta
    target: 'esnext'
  }
})
```eof
