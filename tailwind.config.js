/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        // Paleta Safin360 — Manual de Identidad Visual
        fucsia: '#E6126A',
        celeste: '#35BEE8',
        magenta: '#BF24A0',
        morado: '#3F2087',
        ink: '#1B1F24',
        surface: 'var(--app-surface)',
        'surface-hover': 'var(--app-surface-hover)',
        primary: '#E6126A',
        secondary: '#BF24A0',
        accent: '#3F2087',
      },
      fontFamily: {
        // Sora: tipografía principal · Inter: secundaria (manual de marca)
        display: ['Sora', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      maxWidth: {
        app: '420px',
      },
      borderRadius: {
        card: '16px',
        input: '16px',
        btn: '16px',
      },
      height: {
        input: '56px',
        btn: '56px',
      },
    },
  },
  plugins: [],
};
