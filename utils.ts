
import { ARENA_WIDTH, ARENA_HEIGHT } from './constants';
import { Obstacle, Vector2D, ScoreEntry, LeaderboardData, EventType } from './types';
import { db } from './firebase';
import { collection, addDoc, getDocs, serverTimestamp, query, orderBy, limit } from "firebase/firestore";

// --- SEEDED RANDOM GENERATOR ---
// Permette di generare la stessa mappa per tutti i giocatori nella stessa stanza
class SeededRNG {
  private seed: number;
  constructor(seedStr: string) {
    // Hash semplice della stringa
    let h = 0x811c9dc5;
    for (let i = 0; i < seedStr.length; i++) {
      h ^= seedStr.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    this.seed = h >>> 0;
  }

  // Ritorna numero tra 0 e 1
  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
}

export const checkCircleCollision = (p1: Vector2D, r1: number, p2: Vector2D, r2: number): boolean => {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy) < r1 + r2;
};

export const checkRectCircleCollision = (rect: { x: number, y: number, width: number, height: number }, circle: Vector2D, radius: number): boolean => {
  const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height));
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  return (dx * dx + dy * dy) < (radius * radius);
};

export const checkRectRectCollision = (r1: any, r2: any): boolean => {
  return r1.x < r2.x + r2.width &&
         r1.x + r1.width > r2.x &&
         r1.y < r2.y + r2.height &&
         r1.y + r1.height > r2.y;
};

export const getRandomPos = (margin: number, rng?: SeededRNG): Vector2D => {
  const randomFn = rng ? () => rng.next() : Math.random;
  return {
    x: margin + randomFn() * (ARENA_WIDTH - margin * 2),
    y: margin + randomFn() * (ARENA_HEIGHT - margin * 2),
  };
};

// Modificato per accettare un seed opzionale (roomId)
export const generateObstacles = (seed?: string): Obstacle[] => {
  const obstacles: Obstacle[] = [];
  const rng = seed ? new SeededRNG(seed) : undefined;
  const randomFn = rng ? () => rng.next() : Math.random;

  const counts = {
    building: 18 + Math.floor(randomFn() * 12),
    tree: 50 + Math.floor(randomFn() * 30),
    bench: 25 + Math.floor(randomFn() * 15),
    lamp: 20 + Math.floor(randomFn() * 10)
  };
  
  const attemptAdd = (type: 'building' | 'tree' | 'bench' | 'lamp', w: number, h: number) => {
    const pos = getRandomPos(100, rng);
    const newObs = { type, x: pos.x, y: pos.y, width: w, height: h, seed: randomFn() };
    const overlap = obstacles.some(o => {
      if (type === 'building' && o.type === 'building') return false;
      const padding = (type === 'building' || o.type === 'building') ? 15 : 60;
      return checkRectRectCollision(
        { x: o.x - padding, y: o.y - padding, width: o.width + padding * 2, height: o.height + padding * 2 },
        { x: newObs.x, y: newObs.y, width: newObs.width, height: newObs.height }
      );
    });
    if (!overlap) obstacles.push(newObs as Obstacle);
  };

  for (let i = 0; i < counts.building; i++) attemptAdd('building', 160 + randomFn() * 180, 160 + randomFn() * 180);
  for (let i = 0; i < counts.tree; i++) attemptAdd('tree', 45, 45);
  for (let i = 0; i < counts.lamp; i++) attemptAdd('lamp', 20, 20);
  for (let i = 0; i < counts.bench; i++) attemptAdd('bench', 70, 35);
  return obstacles;
};

const SFX_URLS = {
  INFECT: 'https://assets.mixkit.co/active_storage/sfx/13/13-preview.mp3',
  RADIATION_INFECT: 'https://assets.mixkit.co/active_storage/sfx/1489/1489-preview.mp3',
  PICKUP: 'https://assets.mixkit.co/active_storage/sfx/2020/2020-preview.mp3',
  TELEPORT: 'https://assets.mixkit.co/active_storage/sfx/868/868-preview.mp3',
  LIGHTNING: 'https://assets.mixkit.co/active_storage/sfx/1714/1714-preview.mp3',
  FLOOD: 'https://assets.mixkit.co/active_storage/sfx/1871/1871-preview.mp3',
  METEORITE: 'https://assets.mixkit.co/active_storage/sfx/1287/1287-preview.mp3',
  WIN: 'https://assets.mixkit.co/active_storage/sfx/2010/2010-preview.mp3',
  LOSE: 'https://assets.mixkit.co/active_storage/sfx/3168/3168-preview.mp3',
};

export const audioManager = {
  enabled: true,
  music: null as HTMLAudioElement | null,
  lastMusicIndex: -1,
  initialized: false,
  musicTargetUrl: '',
  init() {
    if (this.initialized) return;
    this.initialized = true;
    const unlock = () => {
      if (this.enabled && (!this.music || this.music.paused)) {
        if (this.music) this.music.play().catch(() => {});
        else if (this.musicTargetUrl) this.startMusicByUrl(this.musicTargetUrl);
      }
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
    window.addEventListener('click', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock);
  },
  setEnabled(e: boolean) {
    this.enabled = e;
    if (!e && this.music) this.music.pause();
    else if (e && this.music) this.music.play().catch(() => {});
  },
  playSFX(url: string, volume: number = 0.7) {
    if (!this.enabled) return;
    const audio = new Audio(url);
    audio.volume = volume;
    audio.play().catch(() => {});
  },
  playCollect() { this.playSFX(SFX_URLS.PICKUP, 0.7); },
  playInfect() { this.playSFX(SFX_URLS.INFECT, 0.8); },
  playRadiationInfect() { this.playSFX(SFX_URLS.RADIATION_INFECT, 0.8); },
  playTeleport() { this.playSFX(SFX_URLS.TELEPORT, 0.6); },
  playWeather(type: EventType) {
    if (type === EventType.LIGHTNING) this.playSFX(SFX_URLS.LIGHTNING, 0.7);
    else if (type === EventType.FLOOD) this.playSFX(SFX_URLS.FLOOD, 0.7);
    else if (type === EventType.METEORITE) this.playSFX(SFX_URLS.METEORITE, 0.7);
  },
  playWin() { this.playSFX(SFX_URLS.WIN, 0.8); },
  playLose() { this.playSFX(SFX_URLS.LOSE, 0.8); },
  startMusicByUrl(url: string) {
    if (this.music) { this.music.pause(); this.music = null; }
    this.music = new Audio(url);
    this.music.loop = true;
    this.music.volume = 0.25;
    if (this.enabled) this.music.play().catch(() => { this.musicTargetUrl = url; });
  },
  startMusic(isGame: boolean = true) {
    let url: string;
    if (!isGame) { url = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3'; }
    else {
      let idx: number;
      do { idx = Math.floor(Math.random() * 17) + 1; } while (idx === this.lastMusicIndex);
      this.lastMusicIndex = idx;
      url = `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${idx}.mp3`;
    }
    this.startMusicByUrl(url);
  },
  stopMusic() { if (this.music) { this.music.pause(); this.music = null; } this.musicTargetUrl = ''; }
};

// --- LOGICA SCORE E LEADERBOARD (OFFLINE & ONLINE) ---
// Utilizziamo un'unica collezione 'global_scores' perché 'online_scores' 
// non ha i permessi di lettura/scrittura configurati su Firebase.
const SCORES_COLLECTION = 'global_scores';

// Salva punteggio OFFLINE
export const saveScore = async (entry: ScoreEntry) => {
  try {
    await addDoc(collection(db, SCORES_COLLECTION), {
      playerName: entry.playerName,
      score: entry.score,
      timestamp: entry.timestamp, 
      serverTimestamp: serverTimestamp(), 
      botCount: entry.botCount
      // NOTA: Non salviamo roomId per i punteggi offline
    });
  } catch (e) {
    console.error("Errore salvataggio Firebase Offline: ", e);
  }
};

// Salva punteggio ONLINE
export const saveOnlineScore = async (entry: ScoreEntry) => {
  try {
    await addDoc(collection(db, SCORES_COLLECTION), {
      playerName: entry.playerName,
      score: entry.score,
      timestamp: entry.timestamp,
      serverTimestamp: serverTimestamp(),
      roomId: entry.roomId || 'unknown', // La presenza di roomId identifica l'online
      playerCount: entry.playerCount || 0
    });
  } catch (e) {
    console.error("Errore salvataggio Firebase Online: ", e);
  }
};

// Funzione interna per recuperare tutti i punteggi (misti)
const fetchRawScores = async (): Promise<ScoreEntry[]> => {
  try {
    const q = collection(db, SCORES_COLLECTION);
    const querySnapshot = await getDocs(q);
    
    const scores: ScoreEntry[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data() as any;
      let ts = 0;
      
      if (data.serverTimestamp && typeof data.serverTimestamp.toMillis === 'function') {
        ts = data.serverTimestamp.toMillis();
      } else if (data.serverTimestamp && typeof data.serverTimestamp.seconds === 'number') {
        ts = data.serverTimestamp.seconds * 1000;
      } else if (data.timestamp && typeof data.timestamp.toMillis === 'function') {
        ts = data.timestamp.toMillis();
      } else if (typeof data.timestamp === 'number') {
        ts = data.timestamp;
      } else if (typeof data.timestamp === 'string' && !isNaN(Number(data.timestamp))) {
        ts = Number(data.timestamp);
      }
      if (ts === 0) ts = Date.now();

      scores.push({
        playerName: String(data.playerName || 'Unknown'),
        score: Number(data.score) || 0,
        botCount: Number(data.botCount) || 0,
        playerCount: Number(data.playerCount) || 0,
        timestamp: ts,
        roomId: data.roomId // Se presente, è online
      });
    });
    return scores.sort((a, b) => b.score - a.score);
  } catch (e) {
    console.error(`Errore recupero Firebase (${SCORES_COLLECTION}): `, e);
    return [];
  }
}

export const fetchAllFirebaseScores = async (): Promise<ScoreEntry[]> => {
  const scores = await fetchRawScores();
  // Ritorniamo solo i punteggi OFFLINE (dove roomId non è definito)
  return scores.filter(s => !s.roomId);
};

export const fetchOnlineFirebaseScores = async (): Promise<ScoreEntry[]> => {
  const scores = await fetchRawScores();
  // Ritorniamo solo i punteggi ONLINE (dove roomId è definito)
  return scores.filter(s => !!s.roomId);
};

export const getPeriodBoundaries = (type: 'daily' | 'weekly' | 'monthly', offset: number = 0) => {
  const now = new Date();
  let start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  if (type === 'daily') {
    start.setDate(start.getDate() - offset);
    end.setDate(end.getDate() - offset);
  } else if (type === 'weekly') {
    const day = now.getDay() || 7;
    start.setDate(start.getDate() - (day - 1) - (offset * 7));
    end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
  } else if (type === 'monthly') {
    start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 0, 23, 59, 59, 999);
  }
  return { start: start.getTime(), end: end.getTime() };
};

export const formatPeriodLabel = (type: 'daily' | 'weekly' | 'monthly', offset: number = 0): string => {
  const bounds = getPeriodBoundaries(type, offset);
  const start = new Date(bounds.start);
  const end = new Date(bounds.end);
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };

  if (type === 'daily') {
    return start.toLocaleDateString('it-IT', options);
  } else if (type === 'weekly') {
    const startStr = start.toLocaleDateString('it-IT', { day: 'numeric' });
    const endStr = end.toLocaleDateString('it-IT', options);
    return `${startStr} - ${endStr}`;
  } else {
    return start.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  }
};
