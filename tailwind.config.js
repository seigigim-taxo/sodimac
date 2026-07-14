/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        surface: '#1c1c1e',
        'surface-hover': '#252528',
        primary: '#F97316',
        secondary: '#FB923C',
        accent: '#EA580C',
      },
      maxWidth: {
        app: '420px',
      },
      borderRadius: {
        card: '32px',
        input: '16px',
        btn: '18px',
      },
      height: {
        input: '64px',
        btn: '64px',
      },
    },
  },
  plugins: [],
};
