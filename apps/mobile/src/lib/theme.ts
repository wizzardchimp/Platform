import { useColorScheme } from 'react-native';

const light = {
  bg: '#F3F5F8', card: '#FFFFFF', text: '#0F1720', sub: '#5B6773', line: '#DDE2E8',
  ok: '#17824A', warn: '#B86B00', bad: '#C62828', accent: '#0A5CFF', accentText: '#FFFFFF',
  okBg: '#E4F4EB', warnBg: '#FFF1DB', badBg: '#FDE7E7', neutralBg: '#E9EDF1',
};
const dark: typeof light = {
  bg: '#0B0F14', card: '#151B22', text: '#F1F4F8', sub: '#93A0AD', line: '#27303A',
  ok: '#4CC585', warn: '#F0A63A', bad: '#FF6B6B', accent: '#5B9BFF', accentText: '#07101F',
  okBg: '#12301F', warnBg: '#3A2A0E', badBg: '#3C1717', neutralBg: '#222B35',
};

export type Theme = typeof light;
export const useTheme = (): Theme => (useColorScheme() === 'dark' ? dark : light);
