import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Theme = 'light' | 'dark' | 'auto';

interface ThemeContextType {
  theme: 'light' | 'dark';
  themePreference: Theme;
  setThemePreference: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_KEY = '@sigmet/theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemTheme = useColorScheme();
  const [themePreference, setThemePreferenceState] = useState<Theme>('auto');
  const [theme, setTheme] = useState<'light' | 'dark'>(
    systemTheme === 'dark' ? 'dark' : 'light'
  );

  useEffect(() => {
    loadTheme();
  }, []);

  useEffect(() => {
    if (themePreference === 'auto') {
      setTheme(systemTheme === 'dark' ? 'dark' : 'light');
    } else {
      setTheme(themePreference);
    }
  }, [themePreference, systemTheme]);

  const loadTheme = async () => {
    try {
      const saved = await AsyncStorage.getItem(THEME_KEY);
      if (saved && (saved === 'light' || saved === 'dark' || saved === 'auto')) {
        setThemePreferenceState(saved as Theme);
      }
    } catch (error) {
      console.error('Error loading theme:', error);
    }
  };

  const setThemePreference = async (newTheme: Theme) => {
    try {
      await AsyncStorage.setItem(THEME_KEY, newTheme);
      setThemePreferenceState(newTheme);
    } catch (error) {
      console.error('Error saving theme:', error);
    }
  };

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setThemePreference(newTheme);
  };

  return (
    <ThemeContext.Provider
      value={{ theme, themePreference, setThemePreference, toggleTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
