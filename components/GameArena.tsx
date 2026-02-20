
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { 
  ARENA_WIDTH, ARENA_HEIGHT, PLAYER_SIZE, PLAYER_SPEED, COLORS, 
  INFECTED_SPEED_BOOST, POWERUP_SPAWN_INTERVAL, POWERUP_CONFIG,
  WEATHER_EVENT_INTERVAL
} from '../constants';
import { 
  Player, PlayerState, Obstacle, PowerUp, PowerUpType, Vector2D, EventType, PermanentHazard
} from '../types';
import { 
  generateObstacles, checkCircleCollision, checkRectCircleCollision, 
  getRandomPos, audioManager, saveScore
} from '../utils';
import { gamepadManager } from '../gamepad'; // Integrazione Gamepad
import HUD from './HUD';
import { Home } from 'lucide-react';

interface GameArenaProps {
  playerName: string;
  botCount: number;
  audioEnabled: boolean;
  setAudioEnabled: (e: boolean) => void;
  onGameOver: (winner: string, time: number) => void;
  onExit: () => void;
}

const POWERUP_DURATION = 8000;
const VIRUS_BOOST = 1.015; 

interface WeatherEvent {
  type: EventType;
  x: number;
  y: number;
  radius: number;
  startTime: number;
  duration: number;
  isActive: boolean;
  soundTriggered?: boolean;
  lastStrikeSoundTime?: number;
}

interface BotAIState {
  lastX: number;
  lastY: number;
  stuckTime: number;
  isWandering: boolean;
  wanderAngle: number;
  speedMultiplier: number;
  angleJitter: number;
  nextDecisionTime: number;
}

const getSafeSpawnPosition = (obstacles: Obstacle[], radius: number): Vector2D => {
  let position: Vector2D;
  let isSafe = false;
  let attempts = 0;
  do {
    position = getRandomPos(150);
    isSafe = !obstacles.some(o => checkRectCircleCollision(o, position, radius + 30));
    attempts++;
  } while (!isSafe && attempts < 100);
  return position;
};

const drawLightningBolt = (ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) => {
  ctx.save();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2 + Math.random() * 3;
  ctx.shadowBlur = 15;
  ctx.shadowColor = '#fef08a';
  let curX = x + (Math.random() - 0.5) * radius * 0.5;
  let curY = y - 800;
  ctx.beginPath();
  ctx.moveTo(curX, curY);
  const segments = 12;
  for(let i = 0; i < segments; i++) {
    curX += (Math.random() - 0.5) * 120;
    curY += 800 / segments;
    ctx.lineTo(curX, curY);
  }
  ctx.stroke();
  for(let i=0; i<8; i++) {
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(x + (Math.random()-0.5)*40, y + (Math.random()-0.5)*40, Math.random()*4, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.restore();
};

const GameArena: React.FC<GameArenaProps> = ({ playerName, botCount, audioEnabled, setAudioEnabled, onGameOver, onExit }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [gameTime, setGameTime] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [zoom, setZoom] = useState(0.85);
  const [isMobile, setIsMobile] = useState(false);
  
  // Stato per il rendering visuale del joypad
  const [joystickVisualOffset, setJoystickVisualOffset] = useState({ x: 0, y: 0, active: false });

  const startTimeRef = useRef<number>(0);
  const botAIStates = useRef<Record<string, BotAIState>>({});
  
  const joystickState = useRef({
    active: false,
    baseX: 0,
    baseY: 0,
    vectorX: 0,
    vectorY: 0
  });

  const gameStateRef = useRef<{
    players: Player[];
    obstacles: Obstacle[];
    powerUps: PowerUp[];
    keys: Record<string, boolean>;
    events: WeatherEvent[];
    hazards: PermanentHazard[];
  }>({
    players: [],
    obstacles: [],
    powerUps: [],
    keys: {},
    events: [],
    hazards: [],
  });

  // Gestione Zoom Dinamico per Mobile e rilevamento device
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setZoom(mobile ? 0.55 : 0.85);
      setIsMobile(mobile);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const initGame = useCallback(() => {
    const obstacles = generateObstacles();
    gameStateRef.current.obstacles = obstacles;
    gameStateRef.current.powerUps = [];
    gameStateRef.current.events = [];
    gameStateRef.current.hazards = [];
    
    const players: Player[] = [];
    const playerPos = getSafeSpawnPosition(obstacles, PLAYER_SIZE);
    startTimeRef.current = Date.now();

    players.push({
      id: 'p1', name: playerName, x: playerPos.x, y: playerPos.y,
      radius: PLAYER_SIZE, state: PlayerState.HEALTHY, isBot: false, speed: PLAYER_SPEED,
      angle: 0, activePowerUps: {}, stunnedUntil: 0, trappedUntil: 0, trail: []
    });

    for (let i = 0; i < botCount; i++) {
      let pos = getSafeSpawnPosition(obstacles, PLAYER_SIZE);
      const isInitialInfected = i === 0;
      players.push({
        id: `bot-${i}`, name: isInitialInfected ? 'VIRUS-0' : `Agent-${i + 1}`, x: pos.x, y: pos.y,
        radius: PLAYER_SIZE, state: isInitialInfected ? PlayerState.INFECTED : PlayerState.HEALTHY,
        isBot: true, speed: PLAYER_SPEED, angle: Math.random() * Math.PI * 2,
        activePowerUps: {}, 
        stunnedUntil: isInitialInfected ? startTimeRef.current + 3000 : 0,
        trappedUntil: 0, trail: []
      });
      botAIStates.current[`bot-${i}`] = { 
        lastX: pos.x, lastY: pos.y, stuckTime: 0, isWandering: false, 
        wanderAngle: Math.random() * Math.PI * 2,
        speedMultiplier: 0.9 + Math.random() * 0.4,
        angleJitter: (Math.random() - 0.5) * 0.6,
        nextDecisionTime: Date.now()
      };
    }
    
    gameStateRef.current.players = players;
    setIsReady(true);
  }, [playerName, botCount]);

  const moveJoystick = useCallback((clientX: number, clientY: number) => {
    if (!joystickState.current.active) return;
    const dx = clientX - joystickState.current.baseX;
    const dy = clientY - joystickState.current.baseY;
    const distance = Math.hypot(dx, dy);
    const maxDistance = 60;
    const angle = Math.atan2(dy, dx);
    const limitedDist = Math.min(distance, maxDistance);
    joystickState.current.vectorX = Math.cos(angle) * (limitedDist / maxDistance);
    joystickState.current.vectorY = Math.sin(angle) * (limitedDist / maxDistance);
    setJoystickVisualOffset({ x: Math.cos(angle) * limitedDist, y: Math.sin(angle) * limitedDist, active: true });
  }, []);

  const endJoystick = useCallback(() => {
    joystickState.current.active = false;
    joystickState.current.vectorX = 0;
    joystickState.current.vectorY = 0;
    setJoystickVisualOffset({ x: 0, y: 0, active: false });
  }, []);

  useEffect(() => {
    if (!joystickVisualOffset.active) return;

    const onWindowMouseMove = (e: MouseEvent) => moveJoystick(e.clientX, e.clientY);
    const onWindowTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        moveJoystick(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    const onWindowEnd = () => endJoystick();

    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowEnd);
    window.addEventListener('touchmove', onWindowTouchMove, { passive: false });
    window.addEventListener('touchend', onWindowEnd);
    window.addEventListener('touchcancel', onWindowEnd);

    return () => {
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowEnd);
      window.removeEventListener('touchmove', onWindowTouchMove);
      window.removeEventListener('touchend', onWindowEnd);
      window.removeEventListener('touchcancel', onWindowEnd);
    };
  }, [joystickVisualOffset.active, moveJoystick, endJoystick]);

  useEffect(() => {
    initGame();
    const handleKeyDown = (e: KeyboardEvent) => {
      gameStateRef.current.keys[e.code] = true;
      if (e.code === 'Escape') setIsPaused(p => !p);
    };
    const handleKeyUp = (e: KeyboardEvent) => gameStateRef.current.keys[e.code] = false;
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    let frame: number;
    const loop = () => {
      if (!isPaused && isReady) update();
      if (isReady) draw();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    const spawn = setInterval(() => {
      if (isPaused || !isReady) return;
      const pos = getSafeSpawnPosition(gameStateRef.current.obstacles, 30);
      gameStateRef.current.powerUps.push({
        id: Math.random().toString(),
        type: Object.values(PowerUpType)[Math.floor(Math.random() * 6)],
        x: pos.x, y: pos.y, spawnTime: Date.now()
      });
    }, POWERUP_SPAWN_INTERVAL);

    const weatherTrigger = setInterval(() => {
      if (isPaused || !isReady) return;
      const types = [EventType.LIGHTNING, EventType.FLOOD, EventType.METEORITE];
      const type = types[Math.floor(Math.random() * types.length)];
      const pos = getRandomPos(300);
      let radius = 100;
      if (type === EventType.FLOOD) radius = 250 + Math.random() * 450;
      else if (type === EventType.METEORITE) radius = 150 + Math.random() * 250;
      else radius = 150 + Math.random() * 350;
      gameStateRef.current.events.push({
        type, x: pos.x, y: pos.y, radius, startTime: Date.now(), duration: type === EventType.METEORITE ? 2500 : 8000, isActive: true
      });
    }, WEATHER_EVENT_INTERVAL);

    const timer = setInterval(() => {
      if (!isPaused && isReady) setGameTime(prev => prev + 1);
    }, 1000);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      cancelAnimationFrame(frame);
      clearInterval(spawn);
      clearInterval(weatherTrigger);
      clearInterval(timer);
    };
  }, [initGame, isPaused, isReady]);

  const startJoystick = (clientX: number, clientY: number) => {
    joystickState.current = { active: true, baseX: clientX, baseY: clientY, vectorX: 0, vectorY: 0 };
    setJoystickVisualOffset({ x: 0, y: 0, active: true });
  };

  const update = () => {
    const { players, obstacles, powerUps, keys, events, hazards } = gameStateRef.current;
    const now = Date.now();
    const p1 = players.find(p => p.id === 'p1');
    if (!p1) return;

    // --- GAMEPAD LOGIC START ---
    // Pause toggle via Start/Options (Button 9 usually)
    if (gamepadManager.checkButtonPressWithCooldown(9)) {
      setIsPaused(prev => !prev);
    }
    // --- GAMEPAD LOGIC END ---

    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      const elapsed = now - e.startTime;
      if (e.type === EventType.FLOOD && !e.soundTriggered) { audioManager.playWeather(e.type); e.soundTriggered = true; }
      if (e.type === EventType.LIGHTNING) {
        const strikeSubPhase = elapsed % 2000;
        if (strikeSubPhase < 16 && (!e.lastStrikeSoundTime || now - e.lastStrikeSoundTime > 1500)) {
           audioManager.playWeather(EventType.LIGHTNING);
           e.lastStrikeSoundTime = now;
        }
      }
      const progress = elapsed / e.duration;
      if (e.type === EventType.METEORITE && !e.soundTriggered && progress >= 0.9) {
        audioManager.playWeather(EventType.METEORITE);
        e.soundTriggered = true;
      }
      if (elapsed > e.duration) {
        if (e.type === EventType.METEORITE) {
          const points: Vector2D[] = [];
          for(let k=0; k<16; k++) {
            const a = (k/16)*Math.PI*2;
            const r = (e.radius * 0.7) * (0.8 + Math.random()*0.3);
            points.push({ x: Math.cos(a)*r, y: Math.sin(a)*r });
          }
          hazards.push({ type: 'crater', x: e.x, y: e.y, radius: e.radius * 0.7, expiry: 0, points });
        }
        events.splice(i, 1);
        continue;
      }
      players.forEach(p => {
        if (Math.hypot(p.x - e.x, p.y - e.y) < e.radius) {
          if (e.type === EventType.LIGHTNING) {
            const strikeSubPhase = elapsed % 2000;
            if (strikeSubPhase < 120) { p.stunnedUntil = Math.max(p.stunnedUntil, now + 1500); }
          }
        }
      });
    }

    for (let i = hazards.length - 1; i >= 0; i--) {
      const h = hazards[i];
      if (h.triggerTime) {
        const remaining = (h.triggerTime + 5000) - now;
        if (remaining <= 0) hazards.splice(i, 1);
        players.forEach(p => { if (Math.hypot(p.x - h.x, p.y - h.y) < h.radius * 0.85) p.trappedUntil = h.triggerTime! + 5000; });
        continue;
      }
      players.forEach(p => { if (Math.hypot(p.x - h.x, p.y - h.y) < h.radius * 0.85) { h.triggerTime = now; p.trappedUntil = now + 5000; } });
    }

    const isFreezeActive = players.some(pl => pl.state === PlayerState.HEALTHY && pl.activePowerUps[PowerUpType.FREEZE] && now < pl.activePowerUps[PowerUpType.FREEZE]);

    players.forEach(p => {
      const isStunned = now < p.stunnedUntil;
      const isTrapped = now < p.trappedUntil;
      if (isStunned || isTrapped) return;

      let dx = 0, dy = 0;
      if (!p.isBot) {
        if (keys['KeyW'] || keys['ArrowUp']) dy -= 1;
        if (keys['KeyS'] || keys['ArrowDown']) dy += 1;
        if (keys['KeyA'] || keys['ArrowLeft']) dx -= 1;
        if (keys['KeyD'] || keys['ArrowRight']) dx += 1;
        
        // --- GAMEPAD MOVEMENT ---
        const gp = gamepadManager.getMovementVector();
        if (gp.x !== 0 || gp.y !== 0) {
          dx = gp.x;
          dy = gp.y;
        }
        // ------------------------

        if (joystickState.current.active) {
          dx = joystickState.current.vectorX;
          dy = joystickState.current.vectorY;
        }
      } else {
        const ai = botAIStates.current[p.id];
        if (now > ai.nextDecisionTime) {
          ai.nextDecisionTime = now + 200 + Math.random() * 300;
          if (ai.isWandering) {
            dx = Math.cos(ai.wanderAngle); dy = Math.sin(ai.wanderAngle);
            if (Math.random() < 0.12) ai.isWandering = false;
          } else {
            let nearestPU = null;
            if (p.state === PlayerState.HEALTHY) {
              let puMinDist = 450;
              powerUps.forEach(pu => { const d = Math.hypot(pu.x - p.x, pu.y - p.y); if (d < puMinDist) { puMinDist = d; nearestPU = pu; } });
            }
            if (nearestPU) {
              dx = (nearestPU as any).x - p.x; dy = (nearestPU as any).y - p.y;
            } else if (p.state === PlayerState.INFECTED) {
              let target = null; let minDist = Infinity;
              players.forEach(other => {
                // MODIFICA LOGICA AI: I bot inseguono chi ha lo scudo (rimosso SHIELD da qui)
                // Ignorano solo chi ha ANTIVIRUS o RADIATION (che ucciderebbe bot sani, ma qui sono infetti... 
                // comunque per mantenere logica esistente tranne scudo:
                const isUntrackable = (other.activePowerUps[PowerUpType.ANTIVIRUS] && now < other.activePowerUps[PowerUpType.ANTIVIRUS]) ||
                                      (other.activePowerUps[PowerUpType.RADIATION] && now < other.activePowerUps[PowerUpType.RADIATION]);
                
                const isInv = (other.activePowerUps[PowerUpType.INVISIBLE] && now < other.activePowerUps[PowerUpType.INVISIBLE]);
                
                if (other.state === PlayerState.HEALTHY && !isUntrackable && !isInv) {
                  const d = Math.hypot(other.x - p.x, other.y - p.y);
                  if (d < minDist) { minDist = d; target = other; }
                }
              });
              if (target) { dx = (target as any).x - p.x; dy = (target as any).y - p.y; }
              else { p.angle += (Math.random() - 0.5); dx = Math.cos(p.angle); dy = Math.sin(p.angle); }
            } else {
              const threat = players.find(v => v.state === PlayerState.INFECTED && Math.hypot(p.x - v.x, p.y - v.y) < 600);
              if (threat) { 
                const angle = Math.atan2(p.y - threat.y, p.x - threat.x) + ai.angleJitter;
                dx = Math.cos(angle); dy = Math.sin(angle);
              } else { 
                if (Math.random() < 0.05) p.angle += (Math.random() - 0.5); 
                dx = Math.cos(p.angle); dy = Math.sin(p.angle); 
              }
            }
          }
          p.angle = Math.atan2(dy, dx);
        } else {
          dx = Math.cos(p.angle); dy = Math.sin(p.angle);
        }
        const dist = Math.hypot(p.x - ai.lastX, p.y - ai.lastY);
        if (dist < 0.3) ai.stuckTime += 16; else ai.stuckTime = 0;
        if (ai.stuckTime > 800) { ai.isWandering = true; ai.wanderAngle = Math.random() * Math.PI * 2; ai.stuckTime = 0; }
        ai.lastX = p.x; ai.lastY = p.y;
      }
      let speedFactor = 1.0;
      events.forEach(e => { if (e.type === EventType.FLOOD && Math.hypot(p.x - e.x, p.y - e.y) < e.radius) speedFactor = 0.4; });
      if (isFreezeActive && p.state === PlayerState.INFECTED) speedFactor *= 0.5;
      const mag = Math.hypot(dx, dy);
      if (mag > 0.01) {
        const ux = dx / mag; const uy = dy / mag;
        const speedMult = p.isBot ? botAIStates.current[p.id].speedMultiplier : 1.0;
        let s = p.speed * speedMult * speedFactor * (p.state === PlayerState.INFECTED ? VIRUS_BOOST : 1);
        if (p.activePowerUps[PowerUpType.SPEED] && now < p.activePowerUps[PowerUpType.SPEED]) s *= 1.7;
        const moveStep = p.isBot ? s : s * Math.min(1, mag);
        let nextX = Math.max(p.radius, Math.min(ARENA_WIDTH - p.radius, p.x + ux * moveStep));
        let nextY = Math.max(p.radius, Math.min(ARENA_HEIGHT - p.radius, p.y + uy * moveStep));
        if (!obstacles.some(o => checkRectCircleCollision(o, { x: nextX, y: p.y }, p.radius))) p.x = nextX;
        if (!obstacles.some(o => checkRectCircleCollision(o, { x: p.x, y: nextY }, p.radius))) p.y = nextY;
      }
      if (p.activePowerUps[PowerUpType.SPEED] && now < p.activePowerUps[PowerUpType.SPEED]) {
        p.trail.push({ x: p.x, y: p.y }); if (p.trail.length > 15) p.trail.shift();
      } else if (p.trail.length > 0) p.trail.shift();
      if (p.state === PlayerState.HEALTHY) {
        for (let i = powerUps.length - 1; i >= 0; i--) {
          if (checkCircleCollision(p, p.radius, powerUps[i], 35)) {
            p.activePowerUps[powerUps[i].type] = now + POWERUP_DURATION;
            if (!p.isBot) audioManager.playCollect();
            powerUps.splice(i, 1);
          }
        }
      }
    });

    players.forEach(pSource => {
      const hasRad = pSource.activePowerUps[PowerUpType.RADIATION] && now < pSource.activePowerUps[PowerUpType.RADIATION];
      if (hasRad || pSource.state === PlayerState.INFECTED) {
        players.forEach(pTarget => {
          if (pSource.id === pTarget.id) return;
          const targetImmune = 
            (pTarget.activePowerUps[PowerUpType.ANTIVIRUS] && now < pTarget.activePowerUps[PowerUpType.ANTIVIRUS]) ||
            (pTarget.activePowerUps[PowerUpType.SHIELD] && now < pTarget.activePowerUps[PowerUpType.SHIELD]) ||
            (pTarget.activePowerUps[PowerUpType.RADIATION] && now < pTarget.activePowerUps[PowerUpType.RADIATION]);
          if (pTarget.state === PlayerState.HEALTHY && !targetImmune) {
            if (checkCircleCollision(pSource, pSource.radius, pTarget, pTarget.radius)) {
              pTarget.state = PlayerState.INFECTED;
              if (pTarget.id === 'p1') {
                if (hasRad && pSource.state !== PlayerState.INFECTED) audioManager.playRadiationInfect();
                else audioManager.playInfect();
                const final = Math.floor((now - startTimeRef.current) / 1000);
                saveScore({ playerName, score: final, botCount, timestamp: Date.now() }); 
                onGameOver(pSource.name, final);
              }
            }
          }
        });
      }
    });
    if (p1.state === PlayerState.HEALTHY && players.filter(p=>p.state===PlayerState.HEALTHY).length === 1 && players.length > 1) {
      const final = Math.floor((now - startTimeRef.current) / 1000);
      saveScore({ playerName, score: final, botCount, timestamp: Date.now() });
      onGameOver(playerName, final);
    }
  };

  const drawMinimap = () => {
    const canvas = minimapCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { players, events, hazards } = gameStateRef.current;
    const scale = canvas.width / ARENA_WIDTH;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw background for minimap
    ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Hazards
    ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
    hazards.forEach(h => {
      ctx.beginPath();
      ctx.arc(h.x * scale, h.y * scale, h.radius * scale, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw Events
    events.forEach(e => {
      if (e.type === EventType.FLOOD) {
        ctx.fillStyle = 'rgba(14, 165, 233, 0.3)';
        ctx.beginPath();
        ctx.arc(e.x * scale, e.y * scale, e.radius * scale, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Draw Players
    players.forEach(p => {
      const now = Date.now();
      // Don't show invisible players on minimap unless it's me
      if (p.activePowerUps[PowerUpType.INVISIBLE] && now < p.activePowerUps[PowerUpType.INVISIBLE] && p.id !== 'p1') return;

      const isMe = p.id === 'p1';
      ctx.fillStyle = isMe ? '#22d3ee' : (p.state === PlayerState.INFECTED ? '#f43f5e' : '#cbd5e1');
      ctx.beginPath();
      ctx.arc(p.x * scale, p.y * scale, isMe ? 3 : 1.5, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  const draw = () => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const { players, obstacles, powerUps, events, hazards } = gameStateRef.current;
    const p1 = players.find(p => p.id === 'p1') || players[0];
    const now = Date.now();
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    const vw = canvas.width / zoom; const vh = canvas.height / zoom;
    const vx = Math.max(0, Math.min(ARENA_WIDTH - vw, p1.x - vw / 2));
    const vy = Math.max(0, Math.min(ARENA_HEIGHT - vh, p1.y - vh / 2));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(zoom, zoom); 
    ctx.translate(-Math.round(vx), -Math.round(vy));
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1;
    for (let x = 0; x <= ARENA_WIDTH; x += 200) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ARENA_HEIGHT); ctx.stroke(); }
    for (let y = 0; y <= ARENA_HEIGHT; y += 200) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(ARENA_WIDTH, y); ctx.stroke(); }
    hazards.forEach(h => {
      ctx.save();
      const alpha = h.triggerTime ? Math.max(0, 1 - (now - h.triggerTime) / 5000) : 1;
      ctx.globalAlpha = alpha;
      const grad = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, h.radius);
      grad.addColorStop(0, '#020617'); grad.addColorStop(0.6, '#450a0a'); grad.addColorStop(1, '#991b1b');
      ctx.fillStyle = grad; ctx.beginPath();
      h.points.forEach((pt, idx) => { if(idx === 0) ctx.moveTo(h.x + pt.x, h.y + pt.y); else ctx.lineTo(h.x + pt.x, h.y + pt.y); });
      ctx.closePath(); ctx.fill(); ctx.restore();
    });
    events.forEach(e => {
      if (e.type === EventType.FLOOD) {
        ctx.fillStyle = 'rgba(14, 165, 233, 0.1)'; ctx.beginPath(); ctx.arc(e.x, e.y, e.radius, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 2;
        for(let j=1; j<=4; j++) {
            const r = (e.radius * (j/4) + (now/15)%30) % e.radius;
            ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI*2); ctx.stroke();
        }
      } else if (e.type === EventType.METEORITE) {
        const progress = (now - e.startTime) / e.duration;
        if (progress < 0.9) {
          ctx.fillStyle = `rgba(0,0,0, ${progress * 0.3})`;
          ctx.beginPath(); ctx.arc(e.x, e.y, e.radius * (0.2 + progress * 0.5), 0, Math.PI*2); ctx.fill();
        }
      } else if (e.type === EventType.LIGHTNING) {
        ctx.fillStyle = 'rgba(254, 240, 138, 0.08)'; ctx.beginPath(); ctx.arc(e.x, e.y, e.radius, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = 'rgba(254, 240, 138, 0.2)'; ctx.lineWidth = 2; ctx.stroke();
      }
    });
    powerUps.forEach(pu => {
      ctx.save();
      const config = (POWERUP_CONFIG as any)[pu.type];
      if (config) {
        // Grafica ultra-semplificata: Solo l'icona
        // Impostiamo il colore dell'icona per differenziarli senza cerchio
        ctx.fillStyle = config.color;
        ctx.font = 'bold 42px Orbitron'; 
        ctx.textAlign = 'center'; 
        ctx.textBaseline = 'middle'; 
        ctx.fillText(config.icon, pu.x, pu.y);
      }
      ctx.restore();
    });
    obstacles.forEach(o => {
      if (o.type === 'building') {
        ctx.fillStyle = '#1e293b'; ctx.fillRect(o.x, o.y, o.width, o.height);
        ctx.strokeStyle = '#334155'; ctx.lineWidth = 2; ctx.strokeRect(o.x, o.y, o.width, o.height);
        ctx.fillStyle = '#020617'; ctx.fillRect(o.x + 5, o.y + 5, o.width - 10, o.height - 10);
        const winW = 8, winH = 8, gap = 12;
        for (let wx = o.x + gap; wx < o.x + o.width - gap; wx += winW + gap) {
          for (let wy = o.y + gap; wy < o.y + o.height - gap; wy += winH + gap) {
            const windowRandom = Math.abs(Math.sin(o.seed * 5555 + wx * 1.5 + wy * 0.7));
            ctx.fillStyle = windowRandom < 0.25 ? COLORS.WINDOW_LIT : (windowRandom < 0.6 ? COLORS.WINDOW_DARK : COLORS.WINDOW_OFF);
            ctx.fillRect(Math.round(wx), Math.round(wy), winW, winH); 
          }
        }
      } else if (o.type === 'tree') {
        const scale = 0.9 + (o.seed % 0.6);
        ctx.fillStyle = COLORS.TREE_TRUNK; ctx.fillRect(Math.round(o.x + (o.width/2) - (5*scale)), Math.round(o.y + 20), Math.round(10*scale), Math.round(35*scale));
        ctx.fillStyle = COLORS.TREE_LEAVES; ctx.beginPath(); ctx.arc(o.x + 10, o.y + 10, 25*scale, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(o.x + 30, o.y + 15, 22*scale, 0, Math.PI*2); ctx.fill();
      } else if (o.type === 'lamp') {
        ctx.fillStyle = COLORS.LAMP_POLE; ctx.fillRect(o.x + 8, o.y + 10, 4, 40);
        ctx.fillStyle = '#000'; ctx.fillRect(o.x + 4, o.y, 12, 10);
        const lGrad = ctx.createRadialGradient(o.x + 10, o.y + 5, 0, o.x + 10, o.y + 5, 60);
        lGrad.addColorStop(0, COLORS.LAMP_LIGHT); lGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = lGrad; ctx.beginPath(); ctx.arc(o.x + 10, o.y + 5, 60, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#fef08a'; ctx.beginPath(); ctx.arc(o.x + 10, o.y + 5, 4, 0, Math.PI*2); ctx.fill();
      } else if (o.type === 'bench') {
        ctx.fillStyle = COLORS.BENCH; ctx.fillRect(Math.round(o.x), Math.round(o.y), Math.round(o.width), 10); ctx.fillRect(Math.round(o.x), Math.round(o.y - 12), Math.round(o.width), 8);
        ctx.fillStyle = COLORS.BENCH_SUPPORT; ctx.fillRect(Math.round(o.x + 5), Math.round(o.y - 12), 4, 35); ctx.fillRect(Math.round(o.x + o.width - 9), Math.round(o.y - 12), 4, 35);
      }
    });
    events.forEach(e => {
      if (e.type === EventType.METEORITE) {
        const progress = (now - e.startTime) / e.duration;
        if (progress < 0.9) {
          const startX = e.x - 400; const startY = e.y - 800;
          const currX = startX + (e.x - startX) * progress;
          const currY = startY + (e.y - startY) * progress;
          const angle = Math.atan2(e.y - startY, e.x - startX);
          const pSize = 45 + Math.random() * 15;
          ctx.save();
          const sciaGrad = ctx.createLinearGradient(startX, startY, currX, currY);
          sciaGrad.addColorStop(0, 'transparent'); sciaGrad.addColorStop(1, `rgba(249, 115, 22, ${0.4 * (1 - progress)})`);
          ctx.fillStyle = sciaGrad; ctx.beginPath(); ctx.moveTo(startX, startY);
          ctx.lineTo(currX + Math.cos(angle + Math.PI/2) * pSize * 0.5, currY + Math.sin(angle + Math.PI/2) * pSize * 0.5);
          ctx.lineTo(currX + Math.cos(angle - Math.PI/2) * pSize * 0.5, currY + Math.sin(angle - Math.PI/2) * pSize * 0.5);
          ctx.closePath(); ctx.fill();
          const mGrad = ctx.createRadialGradient(currX, currY, 0, currX, currY, pSize);
          mGrad.addColorStop(0, '#fef08a'); mGrad.addColorStop(0.3, '#f97316'); mGrad.addColorStop(0.7, '#ef4444'); mGrad.addColorStop(1, 'transparent');
          ctx.fillStyle = mGrad; ctx.beginPath(); ctx.arc(currX, currY, pSize, 0, Math.PI*2); ctx.fill(); ctx.restore();
        } else {
          const explodeS = (progress - 0.9) / 0.1;
          ctx.fillStyle = `rgba(255, 100, 0, ${1 - explodeS})`;
          ctx.beginPath(); ctx.arc(e.x, e.y, e.radius * (1 + explodeS), 0, Math.PI * 2); ctx.fill();
        }
      } else if (e.type === EventType.LIGHTNING) {
        const elapsed = now - e.startTime;
        const strikeSubPhase = elapsed % 2000;
        if (strikeSubPhase < 120) {
          drawLightningBolt(ctx, e.x, e.y, e.radius);
          ctx.save(); ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'; ctx.beginPath(); ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
      }
    });
    players.forEach(p => {
      ctx.save();
      const isVirusZero = p.id === 'bot-0';
      const isFrozen = now < p.stunnedUntil;
      const isTrapped = now < p.trappedUntil;
      const forceInfectedLook = isVirusZero || p.state === PlayerState.INFECTED;
      const borderColor = isFrozen ? COLORS.FROZEN : (forceInfectedLook ? COLORS.INFECTED_BORDER : (p.id==='p1'? COLORS.PLAYER_P1_BORDER : COLORS.HEALTHY_BORDER));
      const bodyColor = (p.id === 'p1') ? COLORS.PLAYER_P1_BODY : (forceInfectedLook ? COLORS.INFECTED_BODY : COLORS.HEALTHY_BODY);
      
      // APPLICAZIONE TRASPARENZA PRIMA DEL DISEGNO
      if(p.activePowerUps[PowerUpType.INVISIBLE] && now < p.activePowerUps[PowerUpType.INVISIBLE]) {
        ctx.globalAlpha = 0.25; 
      }

      if (p.trail.length > 0) {
        for(let i=1; i<p.trail.length; i++) {
          ctx.beginPath(); ctx.moveTo(p.trail[i-1].x, p.trail[i-1].y); ctx.lineTo(p.trail[i].x, p.trail[i].y);
          ctx.strokeStyle = POWERUP_CONFIG.SPEED.color; ctx.lineWidth = i / 1.5; ctx.globalAlpha = i / p.trail.length * 0.4; ctx.stroke();
        }
        // Ripristina alpha se era stato cambiato per la scia (anche se globalAlpha sopra sovrascrive, meglio essere puliti)
        if(p.activePowerUps[PowerUpType.INVISIBLE] && now < p.activePowerUps[PowerUpType.INVISIBLE]) {
           ctx.globalAlpha = 0.25; 
        } else {
           ctx.globalAlpha = 1;
        }
      }
      
      ctx.fillStyle = bodyColor; ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = borderColor; ctx.lineWidth = (p.id === 'p1') ? 5 : 3; ctx.stroke();
      if (isVirusZero) {
        ctx.fillStyle = '#a855f7'; ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI*2); ctx.fill();
      }
      if (p.activePowerUps[PowerUpType.ANTIVIRUS] && now < p.activePowerUps[PowerUpType.ANTIVIRUS]) {
        ctx.strokeStyle = '#10b981'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(p.x, p.y, p.radius * (1.3 + Math.sin(now/150)*0.1), 0, Math.PI * 2); ctx.stroke();
      }
      if (p.activePowerUps[PowerUpType.RADIATION] && now < p.activePowerUps[PowerUpType.RADIATION]) {
        const wave = (now % 800) / 800;
        ctx.strokeStyle = `rgba(225, 29, 72, ${1 - wave})`; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(p.x, p.y, p.radius + wave * 60, 0, Math.PI * 2); ctx.stroke();
      }
      if (p.activePowerUps[PowerUpType.SHIELD] && now < p.activePowerUps[PowerUpType.SHIELD]) {
        ctx.strokeStyle = '#6366f1'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, p.radius + 12, 0, Math.PI * 2); ctx.stroke();
      }
      if (isTrapped) {
        ctx.fillStyle = "rgba(69, 26, 3, 0.4)"; ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fill();
      }
      
      ctx.restore();
      ctx.fillStyle='#fff'; ctx.font='bold 14px Orbitron'; ctx.textAlign='center'; ctx.fillText(p.name, p.x, p.y - 45);
    });
    ctx.restore();
    drawMinimap();
  };

  return (
    <div className="relative w-full h-full cursor-auto overflow-hidden touch-none select-none bg-slate-950">
      {!isReady ? (
        <div className="flex items-center justify-center h-full text-cyan-500 font-black animate-pulse uppercase tracking-tighter italic text-center px-4 text-3xl">Synchronizing Reality...</div>
      ) : (
        <>
          <canvas ref={canvasRef} className="block w-full h-full" />
          <HUD 
            gameTime={gameTime} 
            healthyCount={gameStateRef.current.players.filter(p=>p.state===PlayerState.HEALTHY).length} 
            infectedCount={gameStateRef.current.players.filter(p=>p.state===PlayerState.INFECTED).length} 
            player={gameStateRef.current.players.find(p => p.id === 'p1')!} 
            minimapCanvasRef={minimapCanvasRef}
            isSuddenDeath={gameTime > 120} 
            audioEnabled={audioEnabled}
            setAudioEnabled={setAudioEnabled}
            onExit={onExit}
          />

          {/* Virtual Gray Joypad (Mouse & Touch compatible) - ONLY ON MOBILE */}
          {isMobile && (
            <div 
              className="absolute bottom-12 left-12 w-36 h-36 flex items-center justify-center pointer-events-auto"
              onTouchStart={(e) => startJoystick(e.touches[0].clientX, e.touches[0].clientY)}
              onMouseDown={(e) => startJoystick(e.clientX, e.clientY)}
            >
              {/* Gray Base with transparency */}
              <div className="absolute inset-0 bg-slate-800/30 opacity-60 backdrop-blur-md border-4 border-slate-700/50 rounded-full shadow-2xl flex items-center justify-center">
                <div className="w-4/5 h-4/5 border-2 border-slate-600/20 rounded-full" />
              </div>
              
              {/* Gray Knob with transparency */}
              <div 
                className={`absolute w-16 h-16 bg-slate-400/80 rounded-full shadow-[0_10px_20px_rgba(0,0,0,0.3),inset_0_-4px_8px_rgba(0,0,0,0.1),inset_0_4px_8px_rgba(255,255,255,0.2)] border-2 border-slate-300/50 transition-transform duration-75`}
                style={{
                  transform: joystickVisualOffset.active 
                    ? `translate(${joystickVisualOffset.x}px, ${joystickVisualOffset.y}px)`
                    : 'translate(0, 0)'
                }}
              >
                <div className="absolute inset-0 m-auto w-1.5 h-1.5 bg-slate-600/20 rounded-full" />
              </div>
            </div>
          )}
        </>
      )}
      {isPaused && (
        <div className="absolute inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center">
          <div className="bg-slate-900 border-2 border-slate-800 p-10 rounded-3xl shadow-2xl space-y-6 w-80 text-center">
            <h3 className="text-3xl font-black text-white uppercase tracking-tighter italic">Paused</h3>
            <button onClick={()=>setIsPaused(false)} className="w-full py-4 bg-cyan-600 text-white font-bold rounded-xl active:scale-95 transition-all">Resume</button>
            <button onClick={onExit} className="w-full py-4 bg-slate-800 text-slate-400 font-bold rounded-xl active:scale-95 transition-all flex items-center justify-center gap-2">
              <Home className="w-5 h-5" /> Home
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameArena;
