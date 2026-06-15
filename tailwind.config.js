/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          primary: 'var(--brand-primary)',
          'primary-dark': 'var(--brand-primary-dark)',
          secondary: 'var(--brand-secondary)',
          accent: 'var(--brand-accent)',
          surface: 'var(--brand-surface)',
          title: 'var(--brand-title)',
          text: 'var(--brand-text)',
          sidebar: 'var(--brand-sidebar)',
          'sidebar-text': 'var(--brand-sidebar-text)',
        }
      }
    },
  },
  plugins: [],
}
