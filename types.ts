
export enum GameStatus {
  LOBBY = 'LOBBY',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  GAME_OVER = 'GAME_OVER',
  MULTIPLAYER_LOBBY = 'MULTIPLAYER_LOBBY',
  WAITING_ROOM = 'WAITING_ROOM',
  MULTIPLAYER_PLAYING = 'MULTIPLAYER_PLAYING'
}

export enum PlayerState {
  HEALTHY = 'HEALTHY',
  INFECTED = 'INFECTED',
  FAKE_INFECTED = 'FAKE_INFECTED'
}

export enum PowerUpType {
  SPEED = 'SPEED',
  INVISIBLE = 'INVISIBLE',
  ANTIVIRUS = 'ANTIVIRUS',
  SHIELD = 'SHIELD',
  FREEZE = 'FREEZE',
  RADIATION = 'RADIATION'
}

export enum EventType {
  LIGHTNING = 'LIGHTNING',
  FLOOD = 'FLOOD',
  METEORITE = 'METEORITE'
}

export interface Vector2D {
  x: number;
  y: number;
}

export interface Player {
  id: string;
  name: string;
  x: number;
  y: number;
  radius: number;
  state: PlayerState;
  isBot: boolean;
  speed: number;
  angle: number;
  activePowerUps: Partial<Record<PowerUpType, number>>;
  stunnedUntil: number;
  trappedUntil: number;
  trail: Vector2D[];
}

export interface Obstacle {
  type: 'building' | 'tree' | 'bench' | 'lamp';
  x: number;
  y: number;
  width: number;
  height: number;
  seed: number;
}

export interface PermanentHazard {
  type: 'crater';
  x: number;
  y: number;
  radius: number;
  expiry: number;
  triggerTime?: number; 
  points: Vector2D[]; 
}

export interface PowerUp {
  id: string;
  type: PowerUpType;
  x: number;
  y: number;
  spawnTime: number;
}

export interface ScoreEntry {
  playerName: string;
  score: number;
  timestamp: number;
  botCount: number;
  roomId?: string; // Opzionale per l'online
  playerCount?: number; // Opzionale per l'online
}

export interface LeaderboardData {
  allTime: ScoreEntry[];
  daily: ScoreEntry[];
  weekly: ScoreEntry[];
  monthly: ScoreEntry[];
  history: {
    daily: ScoreEntry[];
    weekly: ScoreEntry[];
    monthly: ScoreEntry[];
  };
  labels: {
    daily: string;
    weekly: string;
    monthly: string;
    histDaily: string;
    histWeekly: string;
    histMonthly: string;
  };
}

// Interfaccia per il passaggio dati tra WaitingRoom e Arena
export interface MultiplayerSessionData {
  myId: string;
  isHost: boolean;
  players: { id: string; name: string; isHost?: boolean }[];
}
