/** @type {import('tailwindcss').Config} */

/*
 * Score Studio design tokens.
 *
 * Two rules govern additions:
 *   1. A value used in more than one component belongs here, not as an
 *      arbitrary `[#hex]` class. One-off values may stay arbitrary.
 *   2. The CSS variables in index.css (:root) are the same palette for rules
 *      Tailwind can't express; change a colour in both places.
 *
 * Opacity is applied with the slash modifier rather than new tokens:
 * `bg-danger/[.08]` for a tinted ground, `border-danger/20` for its edge.
 */
export default {
  future: {
    // hover: styles only where a real pointer hovers, so taps don't leave them stuck on
    hoverOnlyWhenSupported: true,
  },
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        /* --- Ink & surfaces ----------------------------------------- */
        ink: '#0B0B0E',
        paper: '#FAF9F6',
        card: '#FFFFFF',
        /* Recessed ground: segmented controls, table heads, empty wells. */
        sunken: '#F2F0EC',
        'sunken-2': '#F0EDE7',
        /* Text greys as solid-alpha ink, so they sit right on any surface.
         * muted (.58) is the secondary line; subtle (.64) body copy on cards;
         * body (.7) labels. .65 in the old inline styles folds into subtle. */
        muted: 'rgba(11,11,14,0.58)',
        subtle: 'rgba(11,11,14,0.64)',
        body: 'rgba(11,11,14,0.7)',
        stone: '#6F6B64',

        /* --- Lines -------------------------------------------------- */
        border: '#E7E4DE',
        'border-soft': '#EEEBE5',
        'border-strong': '#D8D4CC',
        /* Form-field edge: darker than a card border so inputs read as inputs. */
        field: '#C8C4BC',

        /* --- Brand -------------------------------------------------- */
        ember: '#E2562B',
        'ember-dark': '#C94A22',
        /* Accent as text or behind white text (4.9:1) — mirrors --accent-text. */
        'accent-text': '#C4471F',
        'accent-disabled': '#E89070',
        gold: '#B8893E',
        'gold-dark': '#8A6020',

        /* --- Subjects & status -------------------------------------- */
        'green-sat': '#2E7D5A',
        'green-dark': '#1A6B3C',
        'green-deep': '#1A5C38',
        'blue-sat': '#2563A8',
        'teal-sat': '#0D7377',
        'amber-sat': '#C47A1B',
        'purple-sat': '#8E44AD',
        danger: '#C0392B',
        'danger-dark': '#8B1A10',
        'error-field': '#EF4444',
      },
      boxShadow: {
        /* Elevation scale, mirrored by --shadow-* in index.css. */
        sm: '0 1px 2px rgba(11,11,14,0.04), 0 1px 3px rgba(11,11,14,0.04)',
        md: '0 2px 6px rgba(11,11,14,0.04), 0 8px 24px rgba(11,11,14,0.06)',
        lg: '0 4px 12px rgba(11,11,14,0.06), 0 24px 64px rgba(11,11,14,0.16)',
        /* Resting card, and the lift it gets under a pointer. */
        card: '0 1px 3px rgba(11,11,14,0.04)',
        'card-hover': '0 6px 20px rgba(11,11,14,0.09)',
        stat: '0 1px 3px rgba(11,11,14,0.05)',
        panel: '0 2px 12px rgba(11,11,14,0.06)',
        /* Primary (accent) buttons. */
        accent: '0 2px 10px rgba(226,86,43,0.28)',
        toast: '0 8px 32px rgba(0,0,0,0.22)',
        brand: 'inset 0 -1px 0 rgba(0,0,0,0.12)',
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
      /* Motion. CSS has no springs, so these are the closest bezier fits:
       * spring approximates a critically damped spring (the iOS sheet curve).
       * Named ui-* so Tailwind's stock ease-in/out/in-out keep their meaning. */
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.32, 0.72, 0, 1)',
        ui: 'cubic-bezier(0.22, 1, 0.36, 1)',
        'ui-in': 'cubic-bezier(0.72, 0, 1, 0.32)',
        'ui-in-out': 'cubic-bezier(0.77, 0, 0.175, 1)',
      },
      transitionDuration: {
        press: '100ms',
        quick: '180ms',
        move: '380ms',
      },
      spacing: {
        tabbar: '56px',
      },
      keyframes: {
        fadeUp: { from: { transform: 'translateY(4px)', opacity: '0' }, to: { transform: 'none', opacity: '1' } },
        popIn: { from: { transform: 'scale(0.97)', opacity: '0' }, to: { transform: 'scale(1)', opacity: '1' } },
        scrimIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        dialogIn: {
          from: { transform: 'scale(0.97)', opacity: '0', filter: 'blur(2px)' },
          to: { transform: 'scale(1)', opacity: '1', filter: 'blur(0)' },
        },
        sheetUp: { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        toastIn: { from: { transform: 'translateY(-12px) scale(0.98)', opacity: '0' }, to: { transform: 'none', opacity: '1' } },
        navPopIn: { from: { transform: 'translate(-50%, 6px)', opacity: '0' }, to: { transform: 'translate(-50%, 0)', opacity: '1' } },
        chatSlideUp: { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        chatDotBounce: {
          '0%, 80%, 100%': { transform: 'translateY(0)', opacity: '0.35' },
          '40%': { transform: 'translateY(-5px)', opacity: '1' },
        },
      },
      animation: {
        'fade-up': 'fadeUp 200ms cubic-bezier(0.22, 1, 0.36, 1) backwards',
        pop: 'popIn 160ms cubic-bezier(0.22, 1, 0.36, 1) backwards',
        'scrim-in': 'scrimIn 180ms ease both',
        'dialog-in': 'dialogIn 220ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'sheet-up': 'sheetUp 380ms cubic-bezier(0.32, 0.72, 0, 1) both',
        'toast-in': 'toastIn 380ms cubic-bezier(0.32, 0.72, 0, 1) both',
        'nav-pop': 'navPopIn 150ms cubic-bezier(0.22, 1, 0.36, 1) backwards',
        'chat-slide-up': 'chatSlideUp 380ms cubic-bezier(0.32, 0.72, 0, 1) both',
        'chat-dot': 'chatDotBounce 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
