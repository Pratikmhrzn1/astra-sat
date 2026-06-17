/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#FAF9F6',
        ink: '#0B0B0E',
        ember: '#E2562B',
        'ember-dark': '#C94A22',
        gold: '#B8893E',
        border: '#E7E4DE',
        'border-soft': '#EEEBE5',
        'green-sat': '#2E7D5A',
        'green-dark': '#1A6B3C',
        'blue-sat': '#2563A8',
        card: '#FFFFFF',
      },
      fontFamily: {
        sans: ['Satoshi', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['"Instrument Serif"', 'ui-serif', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
        '3xl': '18px',
      },
    },
  },
  plugins: [],
};
