import React, { useEffect, useRef, useState } from 'react';
import { socket } from '../socket';
import {
  Player,
  Obstacle,
  PlayerState,
  PowerUp,
  PowerUpType,
  EventType,
  PermanentHazard,
  Vector2D,
  MultiplayerSessionData
} from '../types';
import {
  COLORS,
  ARENA_WIDTH,
  ARENA_HEIGHT,
  PLAYER_SIZE,
  PLAYER_SPEED,
  POWERUP_CONFIG,
  INFECTED_SPEED_BOOST
} from '../constants';
import { audioManager, generateObstacles, checkRectCircleCollision, getRandomPos, checkCircleCollision } from '../utils';
import HUD from './HUD';

interface MultiplayerArenaProps {
  playerName: string;
  roomId: string;
  audioEnabled: boolean;
  setAudioEnabled: (e: boolean) => void;
  onExit: () => void;
  sessionData: MultiplayerSessionData;
}

interface RemotePlayer extends Player {
  targetX: number;
  targetY: number;
  lastUpdate: number;
}

interface WeatherEvent {
  type: EventType;
  x: number;
  y: number;
  radius: number;
  startTime: number;
  duration: number;
  isActive: boolean;
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

const POWERUP_DURATION = 8000;

const drawLightningBolt = (ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) => {
  ctx.save();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2 + Math.random() * 3;
  ctx.shadowBlur = 15;
  ctx.shadowColor = '#fef08a';
  let cx = x + (Math.random() - 0.5) * radius * 0.5;
  let cy = y - 800;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  for (let i = 0; i < 12; i++) {
    cx += (Math.random() - 0.5) * 120;
    cy += 800 / 12;
    ctx.lineTo(cx, cy);
  }
  ctx.stroke();
  ctx.restore();
};

const MultiplayerArena: React.FC<MultiplayerArenaProps> = ({
  playerName,
  roomId,
  audioEnabled,
  setAudioEnabled,
  onExit,
  sessionData
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
  const isHostRef = useRef(sessionData.isHost);
  const myIdRef = useRef(sessionData.myId);

  const myPlayerRef = useRef<Player>({
    id: sessionData.myId,
    name: playerName,
    x: 500,
    y: 500,
    radius: PLAYER_SIZE,
    state: PlayerState.HEALTHY,
    isBot: false,
    speed: PLAYER_SPEED,
    angle: 0,
    activePowerUps: {},
    stunnedUntil: 0,
    trappedUntil: 0,
    trail: []
  });

  const otherPlayersRef = useRef<Map<string, RemotePlayer>>(new Map());
  const botsRef = useRef<Map<string, RemotePlayer>>(new Map());
  const botAIStates = useRef<Record<string, BotAIState>>({});
  const obstaclesRef = useRef<Obstacle[]>([]);
  const powerUpsRef = useRef<PowerUp[]>([]);
  const eventsRef = useRef<WeatherEvent[]>([]);
  const hazardsRef = useRef<PermanentHazard[]>([]);
  const collectedItemsRef = useRef<Set<string>>(new Set());
  const lastTxTime = useRef(0);

  const joystickState = useRef({ active: false, baseX: 0, baseY: 0, vectorX: 0, vectorY: 0 });
  const [joystickVisualOffset, setJoystickVisualOffset] = useState({ x: 0, y: 0, active: false });
  const [isMobile, setIsMobile] = useState(false);
  const [zoom, setZoom] = useState(0.85);
  const [gameTime, setGameTime] = useState(0);

  const isPowerActive = (p: Player, type: PowerUpType, now: number) =>
    !!p.activePowerUps[type] && now < (p.activePowerUps[type] as number);

  const getSafeSpawnPosition = (obstacles: Obstacle[], radius: number): Vector2D => {
    let pos = { x: 500, y: 500 };
    let safe = false;
    let attempts = 0;
    while (!safe && attempts < 100) {
      pos = getRandomPos(150);
      safe = !obstacles.some(o => checkRectCircleCollision(o, pos, radius + 25));
      attempts++;
    }
    return pos;
  };

  const ensureVirus = (now: number) => {
    const existingBot = botsRef.current.get('virus-0');
    if (existingBot) {
      if (!botAIStates.current['virus-0']) {
        botAIStates.current['virus-0'] = {
          lastX: existingBot.x,
          lastY: existingBot.y,
          stuckTime: 0,
          isWandering: false,
          wanderAngle: Math.random() * Math.PI * 2,
          speedMultiplier: 1.1,
          angleJitter: 0,
          nextDecisionTime: now
        };
      }
      return;
    }
    const v = getSafeSpawnPosition(obstaclesRef.current, PLAYER_SIZE);
    botsRef.current.set('virus-0', {
      id: 'virus-0',
      name: 'VIRUS-0',
      x: v.x,
      y: v.y,
      targetX: v.x,
      targetY: v.y,
      radius: PLAYER_SIZE,
      state: PlayerState.INFECTED,
      isBot: true,
      speed: PLAYER_SPEED * 1.1,
      angle: 0,
      activePowerUps: {},
      stunnedUntil: now + 3000,
      trappedUntil: 0,
      trail: [],
      lastUpdate: now
    });
    botAIStates.current['virus-0'] = {
      lastX: v.x,
      lastY: v.y,
      stuckTime: 0,
      isWandering: false,
      wanderAngle: Math.random() * Math.PI * 2,
      speedMultiplier: 1.1,
      angleJitter: 0,
      nextDecisionTime: now
    };
  };

  const applyPowerToPlayer = (id: string, type: PowerUpType, now: number) => {
    const exp = now + POWERUP_DURATION;
    if (myPlayerRef.current.id === id && myPlayerRef.current.state === PlayerState.HEALTHY) {
      myPlayerRef.current.activePowerUps[type] = exp;
      return;
    }
    const p = otherPlayersRef.current.get(id);
    if (p && p.state === PlayerState.HEALTHY) {
      p.activePowerUps[type] = exp;
      return;
    }
    const b = botsRef.current.get(id);
    if (b && b.state === PlayerState.HEALTHY) b.activePowerUps[type] = exp;
  };

  useEffect(() => {
    obstaclesRef.current = generateObstacles(roomId);
    const spawn = getSafeSpawnPosition(obstaclesRef.current, PLAYER_SIZE);
    myPlayerRef.current.x = spawn.x;
    myPlayerRef.current.y = spawn.y;

    sessionData.players?.forEach(p => {
      if (p.id === myIdRef.current) return;
      const s = getSafeSpawnPosition(obstaclesRef.current, PLAYER_SIZE);
      otherPlayersRef.current.set(p.id, {
        id: p.id,
        name: p.name,
        x: s.x,
        y: s.y,
        targetX: s.x,
        targetY: s.y,
        radius: PLAYER_SIZE,
        state: PlayerState.HEALTHY,
        isBot: false,
        speed: PLAYER_SPEED,
        angle: 0,
        activePowerUps: {},
        stunnedUntil: 0,
        trappedUntil: 0,
        trail: [],
        lastUpdate: Date.now()
      });
    });

    if (isHostRef.current) ensureVirus(Date.now());

    const onResize = () => {
      const mobile = window.innerWidth < 768;
      setZoom(mobile ? 0.6 : 0.85);
      setIsMobile(mobile);
    };
    onResize();
    window.addEventListener('resize', onResize);
    const timer = setInterval(() => setGameTime(v => v + 1), 1000);

    return () => {
      window.removeEventListener('resize', onResize);
      clearInterval(timer);
    };
  }, [roomId, sessionData]);

  useEffect(() => {
    const onState = (data: any) => {
      if (!data) return;

      if (data.type === 'v2_collect_item') {
        const now = Date.now();
        let collected: PowerUpType | null = null;
        const idx = powerUpsRef.current.findIndex(p => p.id === data.itemId);
        if (idx !== -1) {
          collected = powerUpsRef.current[idx].type;
          powerUpsRef.current.splice(idx, 1);
        } else if ((Object.values(PowerUpType) as string[]).includes(data.itemType)) {
          collected = data.itemType as PowerUpType;
        }
        collectedItemsRef.current.add(data.itemId);
        if (data.id === myIdRef.current && collected) myPlayerRef.current.activePowerUps[collected] = now + POWERUP_DURATION;
        if (isHostRef.current && data.id && collected) applyPowerToPlayer(data.id, collected, now);
        return;
      }

      const pid = data.id || data.player?.id;
      if (data.player && pid && pid !== myIdRef.current) {
        const x = typeof data.player.x === 'number' ? data.player.x : 0;
        const y = typeof data.player.y === 'number' ? data.player.y : 0;
        const ex = otherPlayersRef.current.get(pid);
        if (ex) {
          ex.targetX = x;
          ex.targetY = y;
          if (isHostRef.current) { ex.x = x; ex.y = y; }
          ex.state = data.player.state ?? ex.state;
          ex.activePowerUps = data.player.activePowerUps || {};
          ex.stunnedUntil = data.player.stunnedUntil ?? ex.stunnedUntil;
          ex.trappedUntil = data.player.trappedUntil ?? ex.trappedUntil;
          ex.trail = data.player.trail || [];
        } else {
          otherPlayersRef.current.set(pid, {
            id: pid,
            name: data.player.name || 'Survivor',
            x,
            y,
            targetX: x,
            targetY: y,
            radius: PLAYER_SIZE,
            state: data.player.state ?? PlayerState.HEALTHY,
            isBot: false,
            speed: PLAYER_SPEED,
            angle: 0,
            activePowerUps: data.player.activePowerUps || {},
            stunnedUntil: data.player.stunnedUntil || 0,
            trappedUntil: data.player.trappedUntil || 0,
            trail: data.player.trail || [],
            lastUpdate: Date.now()
          });
        }
      }

      if (data.isHostSync && !isHostRef.current) {
        if (Array.isArray(data.powerUps)) powerUpsRef.current = data.powerUps;
        if (Array.isArray(data.events)) eventsRef.current = data.events;
        if (Array.isArray(data.hazards)) hazardsRef.current = data.hazards;

        if (Array.isArray(data.bots)) {
          const ids = new Set<string>();
          data.bots.forEach((b: any) => {
            if (!b?.id) return;
            ids.add(b.id);
            const ex = botsRef.current.get(b.id);
            if (ex) {
              ex.targetX = b.x ?? ex.targetX;
              ex.targetY = b.y ?? ex.targetY;
              ex.state = b.state ?? ex.state;
              ex.activePowerUps = b.activePowerUps || {};
              ex.stunnedUntil = b.stunnedUntil ?? ex.stunnedUntil;
              ex.trappedUntil = b.trappedUntil ?? ex.trappedUntil;
            } else {
              botsRef.current.set(b.id, {
                id: b.id,
                name: b.name || 'VIRUS-0',
                x: b.x ?? 0,
                y: b.y ?? 0,
                targetX: b.x ?? 0,
                targetY: b.y ?? 0,
                radius: PLAYER_SIZE,
                state: b.state ?? PlayerState.INFECTED,
                isBot: true,
                speed: PLAYER_SPEED,
                angle: 0,
                activePowerUps: b.activePowerUps || {},
                stunnedUntil: b.stunnedUntil || 0,
                trappedUntil: b.trappedUntil || 0,
                trail: b.trail || [],
                lastUpdate: Date.now()
              });
            }
          });
          botsRef.current.forEach((_, id) => { if (!ids.has(id)) botsRef.current.delete(id); });
        }

        if (Array.isArray(data.players)) {
          const seen = new Set<string>();
          data.players.forEach((p: any) => {
            if (!p?.id) return;
            seen.add(p.id);
            if (p.id === myIdRef.current) {
              myPlayerRef.current.state = p.state ?? myPlayerRef.current.state;
              myPlayerRef.current.activePowerUps = p.activePowerUps || {};
              myPlayerRef.current.stunnedUntil = p.stunnedUntil ?? myPlayerRef.current.stunnedUntil;
              myPlayerRef.current.trappedUntil = p.trappedUntil ?? myPlayerRef.current.trappedUntil;
              return;
            }
            const ex = otherPlayersRef.current.get(p.id);
            if (ex) {
              ex.targetX = p.x ?? ex.targetX;
              ex.targetY = p.y ?? ex.targetY;
              ex.state = p.state ?? ex.state;
              ex.activePowerUps = p.activePowerUps || {};
              ex.stunnedUntil = p.stunnedUntil ?? ex.stunnedUntil;
              ex.trappedUntil = p.trappedUntil ?? ex.trappedUntil;
            }
          });
          otherPlayersRef.current.forEach((_, id) => { if (!seen.has(id)) otherPlayersRef.current.delete(id); });
        }
      }
    };

    const onPlayerJoined = (p: any) => {
      if (!p?.id || p.id === myIdRef.current || otherPlayersRef.current.has(p.id)) return;
      const s = getSafeSpawnPosition(obstaclesRef.current, PLAYER_SIZE);
      otherPlayersRef.current.set(p.id, {
        id: p.id,
        name: p.name || 'Survivor',
        x: s.x,
        y: s.y,
        targetX: s.x,
        targetY: s.y,
        radius: PLAYER_SIZE,
        state: PlayerState.HEALTHY,
        isBot: false,
        speed: PLAYER_SPEED,
        angle: 0,
        activePowerUps: {},
        stunnedUntil: 0,
        trappedUntil: 0,
        trail: [],
        lastUpdate: Date.now()
      });
    };

    const onPlayerLeft = (d: any) => { if (d?.playerId) otherPlayersRef.current.delete(d.playerId); };
    const onWelcome = (d: any) => {
      if (d?.myAssignedId) { myIdRef.current = d.myAssignedId; myPlayerRef.current.id = d.myAssignedId; }
      if (typeof d?.isHost === 'boolean') { isHostRef.current = d.isHost; if (d.isHost) ensureVirus(Date.now()); }
    };
    const onHost = (d: any) => {
      const meHost = d?.hostId === myIdRef.current;
      isHostRef.current = meHost;
      if (meHost) ensureVirus(Date.now());
    };

    socket.on('v2_state', onState);
    socket.on('v2_player_joined', onPlayerJoined);
    socket.on('player_left', onPlayerLeft);
    socket.on('v2_welcome', onWelcome);
    socket.on('v2_host', onHost);

    const tx = setInterval(() => {
      const now = Date.now();
      if (!myIdRef.current || now - lastTxTime.current < 45) return;
      lastTxTime.current = now;
      const payload: any = {
        type: 'v2_state',
        roomId,
        id: myIdRef.current,
        player: {
          id: myIdRef.current,
          name: myPlayerRef.current.name,
          x: Math.round(myPlayerRef.current.x),
          y: Math.round(myPlayerRef.current.y),
          state: myPlayerRef.current.state,
          activePowerUps: myPlayerRef.current.activePowerUps,
          stunnedUntil: myPlayerRef.current.stunnedUntil,
          trappedUntil: myPlayerRef.current.trappedUntil,
          trail: myPlayerRef.current.trail
        }
      };
      if (isHostRef.current) {
        payload.isHostSync = true;
        payload.players = [myPlayerRef.current, ...Array.from(otherPlayersRef.current.values())].map(p => ({
          id: p.id, name: p.name, x: Math.round(p.x), y: Math.round(p.y),
          state: p.state, activePowerUps: p.activePowerUps, stunnedUntil: p.stunnedUntil, trappedUntil: p.trappedUntil, trail: p.trail
        }));
        payload.bots = Array.from(botsRef.current.values()).map(b => ({
          id: b.id, name: b.name, x: Math.round(b.x), y: Math.round(b.y),
          state: b.state, activePowerUps: b.activePowerUps, stunnedUntil: b.stunnedUntil, trappedUntil: b.trappedUntil, trail: b.trail
        }));
        payload.powerUps = powerUpsRef.current;
        payload.events = eventsRef.current;
        payload.hazards = hazardsRef.current;
      }
      socket.emit('v2_state', payload);
    }, 50);

    const hello = setInterval(() => socket.emit('v2_hello', { roomId, name: playerName }), 3000);
    return () => {
      socket.off('v2_state', onState);
      socket.off('v2_player_joined', onPlayerJoined);
      socket.off('player_left', onPlayerLeft);
      socket.off('v2_welcome', onWelcome);
      socket.off('v2_host', onHost);
      clearInterval(tx);
      clearInterval(hello);
    };
  }, [roomId, playerName]);

  useEffect(() => {
    const hostLoop = setInterval(() => {
      if (!isHostRef.current) return;
      const now = Date.now();
      ensureVirus(now);

      const humans = [myPlayerRef.current, ...Array.from(otherPlayersRef.current.values())];
      const all = [...humans, ...Array.from(botsRef.current.values())] as Player[];

      if (Math.random() < 0.005 && eventsRef.current.length < 2) {
        const types = [EventType.LIGHTNING, EventType.FLOOD, EventType.METEORITE];
        const type = types[Math.floor(Math.random() * types.length)];
        const pos = getRandomPos(300);
        const radius = type === EventType.FLOOD ? 250 + Math.random() * 450 : (150 + Math.random() * 250);
        eventsRef.current.push({ type, x: pos.x, y: pos.y, radius, startTime: now, duration: type === EventType.METEORITE ? 2500 : 8000, isActive: true });
      }

      for (let i = eventsRef.current.length - 1; i >= 0; i--) {
        const e = eventsRef.current[i];
        const elapsed = now - e.startTime;
        if (elapsed > e.duration) {
          if (e.type === EventType.METEORITE) {
            const points: Vector2D[] = [];
            for (let k = 0; k < 16; k++) {
              const a = (k / 16) * Math.PI * 2;
              const r = (e.radius * 0.7) * (0.8 + Math.random() * 0.3);
              points.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
            }
            hazardsRef.current.push({ type: 'crater', x: e.x, y: e.y, radius: e.radius * 0.7, expiry: 0, points });
          }
          eventsRef.current.splice(i, 1);
          continue;
        }
        if (e.type === EventType.LIGHTNING && (elapsed % 2000) < 120) {
          all.forEach(p => {
            if (Math.hypot(p.x - e.x, p.y - e.y) < e.radius) p.stunnedUntil = Math.max(p.stunnedUntil, now + 1500);
          });
        }
      }

      for (let i = hazardsRef.current.length - 1; i >= 0; i--) {
        const h = hazardsRef.current[i];
        if (h.triggerTime) {
          if ((h.triggerTime + 5000) - now <= 0) { hazardsRef.current.splice(i, 1); continue; }
          all.forEach(p => { if (Math.hypot(p.x - h.x, p.y - h.y) < h.radius * 0.85) p.trappedUntil = h.triggerTime! + 5000; });
          continue;
        }
        all.forEach(p => { if (Math.hypot(p.x - h.x, p.y - h.y) < h.radius * 0.85) { h.triggerTime = now; p.trappedUntil = now + 5000; } });
      }

      if (powerUpsRef.current.length < 6 && Math.random() < 0.01) {
        const s = getSafeSpawnPosition(obstaclesRef.current, 30);
        powerUpsRef.current.push({ id: Math.random().toString(), type: Object.values(PowerUpType)[Math.floor(Math.random() * 6)], x: s.x, y: s.y, spawnTime: now });
      }

      const freezeActive = humans.some(p => p.state === PlayerState.HEALTHY && isPowerActive(p, PowerUpType.FREEZE, now));

      botsRef.current.forEach(bot => {
        const ai = botAIStates.current[bot.id];
        if (!ai || now < bot.stunnedUntil || now < bot.trappedUntil) return;
        if (now > ai.nextDecisionTime) {
          ai.nextDecisionTime = now + 200 + Math.random() * 300;
          let tx = 0, ty = 0;
          if (ai.isWandering) {
            tx = Math.cos(ai.wanderAngle);
            ty = Math.sin(ai.wanderAngle);
            if (Math.random() < 0.12) ai.isWandering = false;
          } else {
            let target: Player | null = null;
            let min = Infinity;
            humans.forEach(p => {
              const untrack = isPowerActive(p, PowerUpType.ANTIVIRUS, now) || isPowerActive(p, PowerUpType.RADIATION, now) || isPowerActive(p, PowerUpType.INVISIBLE, now);
              if (p.state === PlayerState.HEALTHY && !untrack) {
                const d = Math.hypot(p.x - bot.x, p.y - bot.y);
                if (d < min) { min = d; target = p; }
              }
            });
            if (target) { tx = target.x - bot.x; ty = target.y - bot.y; }
            else { ai.isWandering = true; ai.wanderAngle = Math.random() * Math.PI * 2; }
          }
          if (tx !== 0 || ty !== 0) bot.angle = Math.atan2(ty, tx);
        }

        const dist = Math.hypot(bot.x - ai.lastX, bot.y - ai.lastY);
        ai.stuckTime = dist < 0.3 ? ai.stuckTime + 50 : 0;
        if (ai.stuckTime > 800) { ai.isWandering = true; ai.wanderAngle = Math.random() * Math.PI * 2; ai.stuckTime = 0; }
        ai.lastX = bot.x; ai.lastY = bot.y;

        let speedFactor = 1.0;
        eventsRef.current.forEach(e => { if (e.type === EventType.FLOOD && Math.hypot(bot.x - e.x, bot.y - e.y) < e.radius) speedFactor = 0.4; });
        if (freezeActive && bot.state === PlayerState.INFECTED) speedFactor *= 0.5;
        let speed = bot.speed * ai.speedMultiplier * speedFactor * (bot.state === PlayerState.INFECTED ? INFECTED_SPEED_BOOST : 1);
        if (isPowerActive(bot, PowerUpType.SPEED, now)) speed *= 1.7;

        const nx = Math.max(bot.radius, Math.min(ARENA_WIDTH - bot.radius, bot.x + Math.cos(bot.angle) * speed));
        const ny = Math.max(bot.radius, Math.min(ARENA_HEIGHT - bot.radius, bot.y + Math.sin(bot.angle) * speed));
        if (!obstaclesRef.current.some(o => checkRectCircleCollision(o, { x: nx, y: bot.y }, bot.radius))) bot.x = nx;
        if (!obstaclesRef.current.some(o => checkRectCircleCollision(o, { x: bot.x, y: ny }, bot.radius))) bot.y = ny;
      });

      humans.forEach(p => {
        if (p.state !== PlayerState.HEALTHY) return;
        for (let i = powerUpsRef.current.length - 1; i >= 0; i--) {
          const pu = powerUpsRef.current[i];
          if (checkCircleCollision(p, p.radius, pu, 35)) {
            p.activePowerUps[pu.type] = now + POWERUP_DURATION;
            powerUpsRef.current.splice(i, 1);
            if (p.id === myIdRef.current) audioManager.playCollect();
          }
        }
      });

      const players = [...humans, ...Array.from(botsRef.current.values())] as Player[];
      players.forEach(src => {
        const rad = isPowerActive(src, PowerUpType.RADIATION, now);
        if (!(rad || src.state === PlayerState.INFECTED)) return;
        players.forEach(trg => {
          if (src.id === trg.id) return;
          const imm = isPowerActive(trg, PowerUpType.ANTIVIRUS, now) || isPowerActive(trg, PowerUpType.SHIELD, now) || isPowerActive(trg, PowerUpType.RADIATION, now);
          if (trg.state === PlayerState.HEALTHY && !imm && checkCircleCollision(src, src.radius, trg, trg.radius)) {
            trg.state = PlayerState.INFECTED;
            if (trg.id === myIdRef.current) {
              if (rad && src.state !== PlayerState.INFECTED) audioManager.playRadiationInfect();
              else audioManager.playInfect();
            }
          }
        });
      });
    }, 50);
    return () => clearInterval(hostLoop);
  }, []);

  const draw = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const now = Date.now();

    c.width = window.innerWidth;
    c.height = window.innerHeight;
    const me = myPlayerRef.current;
    const vw = c.width / zoom;
    const vh = c.height / zoom;
    const vx = Math.max(0, Math.min(ARENA_WIDTH - vw, me.x - vw / 2));
    const vy = Math.max(0, Math.min(ARENA_HEIGHT - vh, me.y - vh / 2));

    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(-Math.round(vx), -Math.round(vy));

    ctx.strokeStyle = '#0f172a';
    for (let x = 0; x <= ARENA_WIDTH; x += 200) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ARENA_HEIGHT); ctx.stroke(); }
    for (let y = 0; y <= ARENA_HEIGHT; y += 200) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(ARENA_WIDTH, y); ctx.stroke(); }

    hazardsRef.current.forEach(h => {
      const alpha = h.triggerTime ? Math.max(0, 1 - (now - h.triggerTime) / 5000) : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#450a0a';
      ctx.beginPath();
      h.points.forEach((pt, i) => i ? ctx.lineTo(h.x + pt.x, h.y + pt.y) : ctx.moveTo(h.x + pt.x, h.y + pt.y));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });

    eventsRef.current.forEach(e => {
      if (e.type === EventType.FLOOD) {
        ctx.fillStyle = 'rgba(14,165,233,0.1)';
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.type === EventType.LIGHTNING) {
        const phase = (now - e.startTime) % 2000;
        if (phase < 120) drawLightningBolt(ctx, e.x, e.y, e.radius);
      }
    });

    powerUpsRef.current.forEach(pu => {
      const cfg = (POWERUP_CONFIG as any)[pu.type];
      if (!cfg) return;
      ctx.fillStyle = cfg.color;
      ctx.font = 'bold 34px Orbitron';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cfg.icon, pu.x, pu.y);
    });

    obstaclesRef.current.forEach(o => {
      ctx.fillStyle = o.type === 'building' ? '#1e293b' : '#334155';
      ctx.fillRect(o.x, o.y, o.width, o.height);
    });

    const drawP = (p: RemotePlayer | Player, local: boolean) => {
      if (!local && 'targetX' in p) {
        const rp = p as RemotePlayer;
        const dx = rp.targetX - rp.x;
        const dy = rp.targetY - rp.y;
        if (Math.hypot(dx, dy) > 1) { rp.x += dx * 0.3; rp.y += dy * 0.3; } else { rp.x = rp.targetX; rp.y = rp.targetY; }
      }
      const virus = p.name === 'VIRUS-0';
      const frozen = now < p.stunnedUntil;
      const trapped = now < p.trappedUntil;
      const inf = virus || p.state === PlayerState.INFECTED;
      if (isPowerActive(p, PowerUpType.INVISIBLE, now)) ctx.globalAlpha = local ? 0.5 : 0.1;
      ctx.fillStyle = inf ? COLORS.INFECTED_BODY : (local ? COLORS.PLAYER_P1_BODY : COLORS.HEALTHY_BODY);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = frozen ? COLORS.FROZEN : (inf ? COLORS.INFECTED_BORDER : (local ? COLORS.PLAYER_P1_BORDER : COLORS.HEALTHY_BORDER));
      ctx.lineWidth = local ? 5 : 3;
      ctx.stroke();
      if (trapped) {
        ctx.fillStyle = 'rgba(69,26,3,0.4)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(p.name, p.x, p.y - 30);
    };

    botsRef.current.forEach(p => drawP(p, false));
    otherPlayersRef.current.forEach(p => drawP(p, false));
    drawP(me, true);
    ctx.restore();

    const mc = minimapCanvasRef.current;
    if (mc) {
      const m = mc.getContext('2d');
      if (m) {
        m.clearRect(0, 0, mc.width, mc.height);
        m.fillStyle = 'rgba(15,23,42,0.6)';
        m.fillRect(0, 0, mc.width, mc.height);
        const s = mc.width / ARENA_WIDTH;
        const dot = (p: Player, c: string, meDot = false) => {
          if (!meDot && isPowerActive(p, PowerUpType.INVISIBLE, now)) return;
          m.fillStyle = c;
          m.beginPath();
          m.arc(p.x * s, p.y * s, 2, 0, Math.PI * 2);
          m.fill();
        };
        botsRef.current.forEach(p => dot(p, '#f43f5e'));
        otherPlayersRef.current.forEach(p => dot(p, p.state === PlayerState.INFECTED ? '#ef4444' : '#cbd5e1'));
        dot(myPlayerRef.current, myPlayerRef.current.state === PlayerState.INFECTED ? '#ef4444' : '#22d3ee', true);
      }
    }
  };

  useEffect(() => {
    let frame = 0;
    const keys: Record<string, boolean> = {};
    const onDown = (e: KeyboardEvent) => { keys[e.code] = true; };
    const onUp = (e: KeyboardEvent) => { keys[e.code] = false; };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);

    const loop = () => {
      const p = myPlayerRef.current;
      const now = Date.now();
      if (now >= p.stunnedUntil && now >= p.trappedUntil) {
        let dx = 0, dy = 0;
        if (keys['KeyW'] || keys['ArrowUp']) dy = -1;
        if (keys['KeyS'] || keys['ArrowDown']) dy = 1;
        if (keys['KeyA'] || keys['ArrowLeft']) dx = -1;
        if (keys['KeyD'] || keys['ArrowRight']) dx = 1;
        if (joystickState.current.active) { dx = joystickState.current.vectorX; dy = joystickState.current.vectorY; }

        let speedFactor = 1;
        eventsRef.current.forEach(e => { if (e.type === EventType.FLOOD && Math.hypot(p.x - e.x, p.y - e.y) < e.radius) speedFactor = 0.4; });
        const freeze = [myPlayerRef.current, ...Array.from(otherPlayersRef.current.values())]
          .some(v => v.state === PlayerState.HEALTHY && isPowerActive(v, PowerUpType.FREEZE, now));
        if (freeze && p.state === PlayerState.INFECTED) speedFactor *= 0.5;

        const mag = Math.hypot(dx, dy);
        if (mag > 0.01) {
          let speed = p.speed * speedFactor;
          if (isPowerActive(p, PowerUpType.SPEED, now)) speed *= 1.7;
          const nx = p.x + (dx / mag) * Math.min(mag, 1) * speed;
          const ny = p.y + (dy / mag) * Math.min(mag, 1) * speed;
          const cx = Math.max(p.radius, Math.min(ARENA_WIDTH - p.radius, nx));
          const cy = Math.max(p.radius, Math.min(ARENA_HEIGHT - p.radius, ny));
          if (!obstaclesRef.current.some(o => checkRectCircleCollision(o, { x: cx, y: p.y }, p.radius))) p.x = cx;
          if (!obstaclesRef.current.some(o => checkRectCircleCollision(o, { x: p.x, y: cy }, p.radius))) p.y = cy;
        }

        for (let i = powerUpsRef.current.length - 1; i >= 0; i--) {
          const pu = powerUpsRef.current[i];
          if (checkCircleCollision(p, p.radius, pu, 35) && !collectedItemsRef.current.has(pu.id)) {
            collectedItemsRef.current.add(pu.id);
            p.activePowerUps[pu.type] = now + POWERUP_DURATION;
            powerUpsRef.current.splice(i, 1);
            audioManager.playCollect();
            socket.emit('v2_state', { type: 'v2_collect_item', roomId, id: p.id, itemId: pu.id, itemType: pu.type });
          }
        }
      }

      draw();
      frame = requestAnimationFrame(loop);
    };

    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [roomId]);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    joystickState.current = { active: true, baseX: t.clientX, baseY: t.clientY, vectorX: 0, vectorY: 0 };
    setJoystickVisualOffset({ x: 0, y: 0, active: true });
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!joystickState.current.active) return;
    const t = e.touches[0];
    const dx = t.clientX - joystickState.current.baseX;
    const dy = t.clientY - joystickState.current.baseY;
    const dist = Math.min(50, Math.hypot(dx, dy));
    const ang = Math.atan2(dy, dx);
    joystickState.current.vectorX = Math.cos(ang) * (dist / 50);
    joystickState.current.vectorY = Math.sin(ang) * (dist / 50);
    setJoystickVisualOffset({ x: Math.cos(ang) * dist, y: Math.sin(ang) * dist, active: true });
  };
  const onTouchEnd = () => {
    joystickState.current.active = false;
    joystickState.current.vectorX = 0;
    joystickState.current.vectorY = 0;
    setJoystickVisualOffset({ x: 0, y: 0, active: false });
  };

  const allEntities = [myPlayerRef.current, ...Array.from(otherPlayersRef.current.values()), ...Array.from(botsRef.current.values())];
  const healthyCount = allEntities.filter(p => p.state === PlayerState.HEALTHY).length;
  const infectedCount = allEntities.filter(p => p.state === PlayerState.INFECTED).length;

  return (
    <div className="relative w-full h-full bg-slate-950 overflow-hidden touch-none select-none">
      <canvas ref={canvasRef} className="block w-full h-full" />
      <HUD
        gameTime={gameTime}
        healthyCount={healthyCount}
        infectedCount={infectedCount}
        player={myPlayerRef.current}
        minimapCanvasRef={minimapCanvasRef}
        isSuddenDeath={false}
        audioEnabled={audioEnabled}
        setAudioEnabled={setAudioEnabled}
        onExit={onExit}
      />
      {isMobile && (
        <div className="absolute bottom-10 left-10 w-32 h-32 flex items-center justify-center z-50" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
          <div className="absolute inset-0 bg-slate-800/30 backdrop-blur-md rounded-full border border-slate-700/50" />
          <div className="w-12 h-12 bg-cyan-500/80 rounded-full transition-transform duration-75 shadow-lg shadow-cyan-500/20" style={{ transform: `translate(${joystickVisualOffset.x}px, ${joystickVisualOffset.y}px)` }} />
        </div>
      )}
    </div>
  );
};

export default MultiplayerArena;