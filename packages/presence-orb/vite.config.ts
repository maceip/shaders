import {defineConfig} from 'vite'
export default defineConfig({define: {'process.env.NODE_ENV': JSON.stringify('production')}, build: {
    lib: {entry: {index: 'src/index.ts', react: 'src/react.tsx'}, formats: ['es'], fileName: (_format, name) => `${name}.js`, cssFileName: 'presence-orb'},
    target: 'es2022', minify: true,
    rollupOptions: {external: ['react', 'react/jsx-runtime']},
}})
