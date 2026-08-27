/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50:  '#f0f4ff',
          100: '#dde7ff',
          200: '#c3d3fe',
          300: '#98b4fd',
          400: '#6589fa',
          500: '#3f5ff5',
          600: '#2a3fe9',
          700: '#2130d4',
          800: '#2129ab',
          900: '#202887',
          950: '#171a54',
        },
        surface: {
          900: '#0f1117',
          800: '#16192a',
          700: '#1e2235',
          600: '#262c42',
          500: '#2f364f',
        }
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
