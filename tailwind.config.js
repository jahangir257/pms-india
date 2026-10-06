module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Share Tech"', 'sans-serif'] },
      colors: {
        brand: { 50: '#ECF6F2', 100: '#CFE8DF', 200: '#9FD1BF', 300: '#6FB99F', 400: '#2F8F72', 500: '#0B6B52', 600: '#085945', 700: '#075B46', 800: '#065040', 900: '#064E3B', 950: '#03281E' },
        cream: { DEFAULT: '#F8E7C9', 50: '#FDF9F0', 100: '#FBF1DC', 200: '#F8E7C9', 300: '#EFD5A5', 400: '#E2BF80', 500: '#C9A25A' },
      },
    },
  },
  plugins: [],
};
