/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        araldico: {
          50: '#eef7f1',
          100: '#d5ecdd',
          300: '#7cc09a',
          500: '#1e8a55',
          600: '#0f7344',
          700: '#006633',
          800: '#004d26',
          900: '#00331a',
        },
        crema: '#faf7f0',
      },
      fontFamily: {
        display: ['Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}
