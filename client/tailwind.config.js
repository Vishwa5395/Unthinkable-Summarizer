/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Nunito', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Courier New', 'Courier', 'monospace'],
      },
      colors: {
        ink: {
          950: '#0a0a0a',
          900: '#121212',
          850: '#1a1a1a',
          800: '#262626',
          700: '#404040',
          600: '#525252',
          500: '#737373',
          400: '#a3a3a3',
          300: '#d4d4d4',
          200: '#e5e5e5',
          100: '#f5f5f5',
          50: '#fafafa',
        },
        paper: {
          light: '#ffffff',
          warm: '#fbfbfa',
          muted: '#f4f4f0',
          card: '#ffffff',
          dark: '#0e0e12',
          darkcard: '#16161b',
          darkmuted: '#1f1f26',
        },
        accent: {
          highlight: '#ffeb3b',
          amber: '#f59e0b',
          muted: '#8b5cf6',
          danger: '#ef4444',
          success: '#10b981',
        },
      },
      boxShadow: {
        'brutal': '2px 2px 0px #000000',
        'brutal-dark': '2px 2px 0px #3f3f46',
        'brutal-lg': '4px 4px 0px #000000',
        'brutal-lg-dark': '4px 4px 0px #3f3f46',
        'brutal-sm': '1px 1px 0px #000000',
        'brutal-sm-dark': '1px 1px 0px #3f3f46',
        'brutal-inverted': '2px 2px 0px #ffffff',
      },
      borderWidth: {
        '1.5': '1.5px',
      },
    },
  },
  plugins: [],
}
