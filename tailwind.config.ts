import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Base colors - dark trading terminal theme
        background: {
          DEFAULT: '#06090f',
          surface: '#0b0f16',
          card: '#131b27',
          elevated: '#1a2535',
        },
        border: {
          DEFAULT: '#1a2535',
          subtle: '#141c28',
          strong: '#2a3a50',
        },
        text: {
          primary: '#e2e8ef',
          secondary: '#8b9bb4',
          muted: '#5a6a80',
          ghost: '#3a4a5f',
        },
        // Accent colors
        accent: {
          DEFAULT: '#22d3ee', // Cyan
          hover: '#06b6d4',
          muted: '#164e63',
        },
        // Trading colors
        bull: {
          DEFAULT: '#22c55e',
          light: '#4ade80',
          muted: '#166534',
          bg: 'rgba(34, 197, 94, 0.1)',
        },
        bear: {
          DEFAULT: '#ef4444',
          light: '#f87171',
          muted: '#991b1b',
          bg: 'rgba(239, 68, 68, 0.1)',
        },
        warning: {
          DEFAULT: '#f59e0b',
          light: '#fbbf24',
          muted: '#92400e',
          bg: 'rgba(245, 158, 11, 0.1)',
        },
        // Status colors
        crisis: '#ef4444',
        elevated: '#f59e0b',
        normal: '#22c55e',
      },
      fontFamily: {
        sans: ['var(--font-dm-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(34, 211, 238, 0.2)' },
          '100%': { boxShadow: '0 0 20px rgba(34, 211, 238, 0.4)' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'grid-pattern': `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%231a2535' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      },
    },
  },
  plugins: [],
};

export default config;
