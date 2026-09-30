import { createContext, useContext, useState, useEffect } from 'react';

export const THEMES = [
  {
    id: 'purple',
    name: 'DEVHUB Purple',
    description: 'Classic Dark & Purple',
    accent: '#6366f1',
    bg: '#090c13',
    icon: 'fa-solid fa-moon'
  },
  {
    id: 'green',
    name: 'Black + Green',
    description: 'Deep Black & Cyber Green',
    accent: '#10b981',
    bg: '#040805',
    icon: 'fa-solid fa-terminal'
  },
  {
    id: 'light',
    name: 'Clean Light',
    description: 'Crisp White & Minimal Slate',
    accent: '#4f46e5',
    bg: '#f8fafc',
    icon: 'fa-solid fa-sun'
  },
  {
    id: 'warm',
    name: 'Warm Light',
    description: 'Cream White & Warm Amber',
    accent: '#d97706',
    bg: '#f7f4ed',
    icon: 'fa-solid fa-mug-saucer'
  },
  {
    id: 'blue',
    name: 'Oceanic Blue',
    description: 'Deep Navy & Sapphire',
    accent: '#3b82f6',
    bg: '#060b18',
    icon: 'fa-solid fa-water'
  }
];

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      return localStorage.getItem('devhub_theme') || 'purple';
    } catch {
      return 'purple';
    }
  });

  const setTheme = (newTheme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem('devhub_theme', newTheme);
      document.documentElement.setAttribute('data-theme', newTheme);
    } catch (e) {
      console.error('Failed to save theme preference', e);
    }
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
