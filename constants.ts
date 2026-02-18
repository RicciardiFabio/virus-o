export const ARENA_WIDTH = 3000;
export const ARENA_HEIGHT = 2500;
export const PLAYER_SIZE = 22;
export const PLAYER_SPEED = 4.5;
export const INFECTED_SPEED_BOOST = 1.015; 
export const POWERUP_SPAWN_INTERVAL = 1200; 
export const SUDDEN_DEATH_TIME = 120000;
export const WEATHER_EVENT_INTERVAL = 5000; // Eventi molto più frequenti (ogni 5s)

export const COLORS = {
  HEALTHY_BORDER: '#cbd5e1', 
  HEALTHY_BODY: '#f8fafc',   
  PLAYER_P1_BORDER: '#22d3ee', 
  PLAYER_P1_BODY: '#06b6d4', 
  BOT_HEALTHY_BODY: '#f1f5f9', 
  INFECTED_BORDER: '#f43f5e', 
  INFECTED_BODY: '#450a0a', 
  GRID_LINES: '#0f172a',
  WINDOW_LIT: '#facc15',
  WINDOW_DARK: '#334155', 
  WINDOW_OFF: '#020617',  
  TREE_LEAVES: '#16a34a',    
  TREE_TRUNK: '#451a03',
  BENCH: '#78350f', 
  BENCH_SUPPORT: '#27272a',
  LIGHTNING: '#fef08a',
  METEORITE: '#f97316',
  FROZEN: '#38bdf8', 
  LAMP_POLE: '#334155',
  LAMP_LIGHT: 'rgba(253, 224, 71, 0.4)',
};

export const POWERUP_CONFIG = {
  SPEED: { duration: 8000, color: '#3b82f6', icon: '⚡', label: 'Hyper Speed' },
  INVISIBLE: { duration: 8000, color: '#94a3b8', icon: '👻', label: 'Stealth Mode' },
  ANTIVIRUS: { duration: 8000, color: '#10b981', icon: '💊', label: 'Antivirus' },
  SHIELD: { duration: 8000, color: '#6366f1', icon: '🛡️', label: 'Ion Shield' },
  FREEZE: { duration: 8000, color: '#0ea5e9', icon: '❄️', label: 'Stasis Field' },
  RADIATION: { duration: 8000, color: '#eab308', icon: '☢️', label: 'Radiation' },
};