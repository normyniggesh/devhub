export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'sans-serif'],
      },
      colors: {
        brand: {
          dark: '#0a0d14',
          sidebar: '#0d1017',
          card: '#131823',
          cardBorder: '#1c2234',
          purple: '#5e4cfc',
          purpleHover: '#4e3de0',
          accent: '#8265f8'
        }
      }
    }
  },
  plugins: [],
}
