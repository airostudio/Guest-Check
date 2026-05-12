/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Sage / forest greens — replaces previous blue brand palette
        brand: {
          50: '#f3f6ee',
          100: '#e3ebd5',
          200: '#c7d6ab',
          300: '#a4bd80',
          400: '#7f9f5b',
          500: '#5d8142',
          600: '#476832',
          700: '#385128',
          800: '#2c3f20',
          900: '#1e2b16',
        },
        // Warm paper / cream tones used for backgrounds and the hero card
        cream: {
          50: '#fdfaf2',
          100: '#f8f1de',
          200: '#f0e6c8',
          300: '#e6d9b0',
          400: '#d9c693',
          500: '#c4ad6f',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Fraunces"', 'Georgia', 'serif'],
        script: ['"Great Vibes"', 'cursive'],
      },
    },
  },
  plugins: [],
};
