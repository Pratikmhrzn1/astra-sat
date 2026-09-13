/** @type {import('tailwindcss').Config} */
export default {
  future: {
    // hover: styles only where a real pointer hovers, so taps don't leave them stuck on
    hoverOnlyWhenSupported: true,
  },
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
        sans: ['var(--font-sans)'],
        display: ['var(--font-display)'],
        serif: ['var(--font-reading)'],
        mono: ['var(--font-mono)'],
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
