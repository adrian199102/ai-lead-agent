import type { Config } from 'tailwindcss'
export default { content: ['./app/**/*.{ts,tsx}','./components/**/*.{ts,tsx}'], theme: { extend: { colors: { ink: '#101828', brand: '#4856e8' } } }, plugins: [] } satisfies Config
