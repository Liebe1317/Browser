import { CustomColorTheme } from '../types/browser';

export const THEME_PRESETS: CustomColorTheme[] = [
  {
    id: 'stealth_emerald',
    name: 'الزمرد السيبراني (Stealth Emerald)',
    primaryAccent: '#10b981',
    browserBg: '#06130f',
    browserSurface: '#0c221c',
    browserNavbar: '#102e26',
    browserBorder: '#17473a',
    textColor: '#ecfdf5',
  },
  {
    id: 'chrome_dark',
    name: 'كروم الكلاسيكي (Carbon Chrome)',
    primaryAccent: '#38bdf8',
    browserBg: '#0f172a',
    browserSurface: '#1e293b',
    browserNavbar: '#243047',
    browserBorder: '#334155',
    textColor: '#f8fafc',
  },
  {
    id: 'cyber_ocean',
    name: 'المحيط السيبراني (Cyber Ocean)',
    primaryAccent: '#06b6d4',
    browserBg: '#030e1b',
    browserSurface: '#081a2f',
    browserNavbar: '#0d2542',
    browserBorder: '#14365d',
    textColor: '#f0f9ff',
  },
  {
    id: 'amethyst_twilight',
    name: 'شفق الجمشت (Amethyst Twilight)',
    primaryAccent: '#a855f7',
    browserBg: '#12071f',
    browserSurface: '#1c0c30',
    browserNavbar: '#281245',
    browserBorder: '#3e1c69',
    textColor: '#faf5ff',
  },
  {
    id: 'sunset_amber',
    name: 'الكهرمان الذهبي (Sunset Amber)',
    primaryAccent: '#f59e0b',
    browserBg: '#171103',
    browserSurface: '#261b05',
    browserNavbar: '#382807',
    browserBorder: '#4f390a',
    textColor: '#fffbeb',
  },
  {
    id: 'crimson_sentinel',
    name: 'الدرع القرمزي (Crimson Sentinel)',
    primaryAccent: '#f43f5e',
    browserBg: '#17050b',
    browserSurface: '#260a14',
    browserNavbar: '#380f1e',
    browserBorder: '#54172c',
    textColor: '#fff1f2',
  },
  {
    id: 'light_titanium',
    name: 'تيتانيوم نهاري فاقع (Light Titanium)',
    primaryAccent: '#0284c7',
    browserBg: '#f1f5f9',
    browserSurface: '#e2e8f0',
    browserNavbar: '#ffffff',
    browserBorder: '#cbd5e1',
    textColor: '#0f172a',
  },
];

export function applyCustomTheme(theme: CustomColorTheme) {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  root.style.setProperty('--theme-accent', theme.primaryAccent);
  root.style.setProperty('--theme-bg-base', theme.browserBg);
  root.style.setProperty('--theme-bg-surface', theme.browserSurface);
  root.style.setProperty('--theme-bg-navbar', theme.browserNavbar);
  root.style.setProperty('--theme-border', theme.browserBorder);
  root.style.setProperty('--theme-text', theme.textColor);

  // Set hex with opacity for backgrounds and rings
  root.style.setProperty('--theme-accent-20', `${theme.primaryAccent}33`);
  root.style.setProperty('--theme-accent-10', `${theme.primaryAccent}1a`);

  try {
    localStorage.setItem('aegis_custom_theme', JSON.stringify(theme));
  } catch (e) {
    console.warn('Failed to save theme to localStorage:', e);
  }
}

export function getSavedTheme(): CustomColorTheme {
  try {
    const saved = localStorage.getItem('aegis_custom_theme');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.warn('Failed to read theme from localStorage:', e);
  }
  return THEME_PRESETS[0];
}
