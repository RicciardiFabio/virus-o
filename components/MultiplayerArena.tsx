
import React, { useEffect, useRef, useState } from 'react';
import { socket } from '../socket';
import { Player, Obstacle, PlayerState, PowerUp, PowerUpType, EventType, PermanentHazard, Vector2D, MultiplayerSessionData } from '../types';
import { COLORS, ARENA_WIDTH, ARENA_HEIGHT, PLAYER_SIZE, PLAYER_SPEED, POWERUP_CONFIG, INFECTED_SPEED_BOOST } from '../constants';
import { audioManager, generateObstacles, checkRectCircleCollision, getRandomPos, checkCircleCollision } from '../utils'; 
import HUD from './HUD';
import { Home } from 'lucide-react';

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

// --- VISUAL FX HELPERS (Copied exactly from GameArena) ---
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

const MultiplayerArena: React.FC<MultiplayerArenaProps> = ({ playerName, roomId, audioEnabled, setAudioEnabled, onExit, sessionData }) => {
    
    // --- REFS ---
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
    
    const isHostRef = useRef(sessionData.isHost);
    const myIdRef = useRef(sessionData.myId);
    
    // Game Objects
    const myPlayerRef = useRef<Player>({
        id: sessionData.myId,
        name: playerName,
        x: 500, y: 500, radius: PLAYER_SIZE,
        state: PlayerState.HEALTHY, isBot: false, speed: PLAYER_SPEED,
        angle: 0, activePowerUps: {}, stunnedUntil: 0, trappedUntil: 0, trail: []
    });

    const otherPlayersRef = useRef<Map<string, RemotePlayer>>(new Map());
    const botsRef = useRef<Map<string, RemotePlayer>>(new Map()); // Only for VIRUS-0
    const botAIStates = useRef<Record<string, BotAIState>>({}); // Host only

    const obstaclesRef = useRef<Obstacle[]>([]);
    const powerUpsRef = useRef<PowerUp[]>([]);
    const eventsRef = useRef<any[]>([]); 
    const hazardsRef = useRef<PermanentHazard[]>([]);
    const collectedItemsRef = useRef<Set<string>>(new Set());
    
    // Controllo frequenza invio
    const lastTxTime = useRef(0);
    
    // Joystick State
    const [joystickVisualOffset, setJoystickVisualOffset] = useState({ x: 0, y: 0, active: false });
    const joystickState = useRef({ active: false, baseX: 0, baseY: 0, vectorX: 0, vectorY: 0 });
    const [isMobile, setIsMobile] = useState(false);
    const [zoom, setZoom] = useState(0.85);
    const [gameTime, setGameTime] = useState(0);

    // --- SETUP ---
    const getSafeSpawnPosition = (obstacles: Obstacle[], radius: number): Vector2D => {
        let position: Vector2D = { x: 500, y: 500 };
        let isSafe = false;
        let attempts = 0;
        while (!isSafe && attempts < 50) {
            position = getRandomPos(150);
            if (!obstacles.some(o => checkRectCircleCollision(o, position, radius + 25))) isSafe = true;
            attempts++;
        }
        return position;
    };

    useEffect(() => {
        // Init Map
        obstaclesRef.current = generateObstacles(roomId);
        
        // Init My Player
        const startPos = getSafeSpawnPosition(obstaclesRef.current, PLAYER_SIZE);
        myPlayerRef.current.x = startPos.x;
        myPlayerRef.current.y = startPos.y;

        // Init Existing Players from Session Data
        if (sessionData.players) {
             sessionData.players.forEach(p => {
                 if (p.id !== myIdRef.current) {
                     const spawn = getSafeSpawnPosition(obstaclesRef.current, PLAYER_SIZE);
                     otherPlayersRef.current.set(p.id, {
                         id: p.id, name: p.name,
                         x: spawn.x, y: spawn.y, targetX: spawn.x, targetY: spawn.y,
                         radius: PLAYER_SIZE, state: PlayerState.HEALTHY, isBot: false, speed: PLAYER_SPEED,
                         angle: 0, activePowerUps: {}, stunnedUntil: 0, trappedUntil: 0, trail: [],
                         lastUpdate: Date.now()
                     });
                 }
             });
        }

        // Host Init: Only Spawn VIRUS-0
        if (isHostRef.current && botsRef.current.size === 0) {
            console.log("[ARENA] HOST: Spawning VIRUS-0");
            
            // Spawn Virus-0
            const vPos = getSafeSpawnPosition(obstaclesRef.current, PLAYER_SIZE);
            const virusId = 'virus-0';
            botsRef.current.set(virusId, {
                id: virusId, name: 'VIRUS-0', x: vPos.x, y: vPos.y, targetX: vPos.x, targetY: vPos.y,
                radius: PLAYER_SIZE, state: PlayerState.INFECTED, isBot: true, speed: PLAYER_SPEED * 1.1,
                angle: 0, activePowerUps: {}, stunnedUntil: 0, trappedUntil: 0, trail: [], lastUpdate: Date.now()
            });
            botAIStates.current[virusId] = { 
                lastX: vPos.x, lastY: vPos.y, stuckTime: 0, isWandering: false, 
                wanderAngle: Math.random() * Math.PI * 2, speedMultiplier: 1.1, angleJitter: 0, nextDecisionTime: Date.now() 
            };
            // NO EXTRA BOTS
        }

        const handleResize = () => {
            const mobile = window.innerWidth < 768;
            setZoom(mobile ? 0.6 : 0.85);
            setIsMobile(mobile);
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        
        const timerInterval = setInterval(() => setGameTime(t => t + 1), 1000);

        return () => {
            window.removeEventListener('resize', handleResize);
            clearInterval(timerInterval);
        };
    }, [roomId, sessionData]);


    // --- NETWORKING ---
    useEffect(() => {
        // 1. INCOMING DATA
        const onState = (data: any) => {
            if (!data) return;
            const pid = data.id || (data.player ? data.player.id : null);
            if (pid === myIdRef.current) return;

            // Handle Item Collection sync
            if (data.type === 'v2_collect_item' && isHostRef.current) {
                const idx = powerUpsRef.current.findIndex(p => p.id === data.itemId);
                if (idx !== -1) {
                    powerUpsRef.current.splice(idx, 1);
                }
                return;
            }

            // Sync Player Data
            if (data.player && pid) {
                const existing = otherPlayersRef.current.get(pid);
                const rxX = typeof data.player.x === 'number' ? data.player.x : 0;
                const rxY = typeof data.player.y === 'number' ? data.player.y : 0;
                
                if (existing) {
                    existing.targetX = rxX;
                    existing.targetY = rxY;
                    existing.state = data.player.state;
                    existing.activePowerUps = data.player.activePowerUps || {};
                    existing.trail = data.player.trail || [];
                    existing.lastUpdate = Date.now();
                } else {
                    otherPlayersRef.current.set(pid, {
                        ...data.player,
                        id: pid,
                        targetX: rxX, targetY: rxY,
                        radius: PLAYER_SIZE,
                        lastUpdate: Date.now()
                    });
                }
            }

            // Sync Host World Data
            if (data.isHostSync && !isHostRef.current) {
                if (data.bots) {
                    data.bots.forEach((b: any) => {
                        if (!b.id) return;
                        const existing = botsRef.current.get(b.id);
                        if (existing) {
                            existing.targetX = b.x;
                            existing.targetY = b.y;
                            existing.state = b.state;
                            existing.activePowerUps = b.activePowerUps || {};
                            existing.lastUpdate = Date.now();
                        } else {
                            botsRef.current.set(b.id, { ...b, targetX: b.x, targetY: b.y, lastUpdate: Date.now() });
                        }
                    });
                }
                if (data.powerUps) powerUpsRef.current = data.powerUps;
                if (data.events) eventsRef.current = data.events;
                if (data.hazards) hazardsRef.current = data.hazards;
            }
        };

        const onPlayerJoined = (data: any) => {
             if (data.id && data.id !== myIdRef.current && !otherPlayersRef.current.has(data.id)) {
                 otherPlayersRef.current.set(data.id, {
                     id: data.id, name: data.name || 'Survivor',
                     x: 500, y: 500, targetX: 500, targetY: 500,
                     radius: PLAYER_SIZE, state: PlayerState.HEALTHY, isBot: false, speed: PLAYER_SPEED,
                     angle: 0, activePowerUps: {}, stunnedUntil: 0, trappedUntil: 0, trail: [],
                     lastUpdate: Date.now()
                 });
             }
        };
        
        const onWelcome = (data: any) => {
             if (data.myAssignedId) myIdRef.current = data.myAssignedId;
        };

        socket.on('v2_state', onState);
        socket.on('v2_player_joined', onPlayerJoined);
        socket.on('v2_welcome', onWelcome);

        // 2. OUTGOING DATA (TX)
        const txInterval = setInterval(() => {
            if (!myIdRef.current) return;
            const now = Date.now();
            if (now - lastTxTime.current < 45) return; 
            lastTxTime.current = now;

            const payload: any = {
                type: 'v2_state',
                roomId: roomId,
                id: myIdRef.current,
                player: {
                    id: myIdRef.current,
                    name: myPlayerRef.current.name,
                    x: Math.round(myPlayerRef.current.x),
                    y: Math.round(myPlayerRef.current.y),
                    state: myPlayerRef.current.state,
                    activePowerUps: myPlayerRef.current.activePowerUps,
                    trail: myPlayerRef.current.trail 
                }
            };

            if (isHostRef.current) {
                payload.isHostSync = true;
                payload.bots = Array.from(botsRef.current.values()).map(b => ({
                    id: b.id, x: Math.round(b.x), y: Math.round(b.y), state: b.state, activePowerUps: b.activePowerUps || {}
                }));
                payload.powerUps = powerUpsRef.current;
                payload.events = eventsRef.current;
                payload.hazards = hazardsRef.current;
            }
            
            socket.emit('v2_state', payload);
        }, 50);

        const heartbeatInterval = setInterval(() => {
            socket.emit('v2_hello', { roomId, name: playerName });
        }, 3000);

        return () => {
            socket.off('v2_state', onState);
            socket.off('v2_player_joined', onPlayerJoined);
            socket.off('v2_welcome', onWelcome);
            clearInterval(txInterval);
            clearInterval(heartbeatInterval);
        };
    }, [roomId]);


    // --- HOST PHYSICS ENGINE ---
    useEffect(() => {
        const hostLoop = setInterval(() => {
            if (!isHostRef.current) return;
            const now = Date.now();

            // 1. WEATHER & EVENTS
            if (Math.random() < 0.005 && eventsRef.current.length < 2) { 
                const types = [EventType.LIGHTNING, EventType.FLOOD, EventType.METEORITE];
                const type = types[Math.floor(Math.random() * types.length)];
                const pos = getRandomPos(300);
                let radius = 100;
                let dur = 8000;
                if (type === EventType.FLOOD) radius = 250 + Math.random() * 450;
                else if (type === EventType.METEORITE) { radius = 150 + Math.random() * 250; dur = 2500; }
                else radius = 150 + Math.random() * 350;
                
                eventsRef.current.push({
                    type, x: pos.x, y: pos.y, radius, startTime: now, duration: dur, isActive: true
                });
            }

            for (let i = eventsRef.current.length - 1; i >= 0; i--) {
                const e = eventsRef.current[i];
                if (now - e.startTime > e.duration) {
                    if (e.type === EventType.METEORITE) {
                         const points: Vector2D[] = [];
                         for(let k=0; k<12; k++) {
                             const a = (k/12)*Math.PI*2;
                             const r = (e.radius * 0.7) * (0.8 + Math.random()*0.3);
                             points.push({ x: Math.cos(a)*r, y: Math.sin(a)*r });
                         }
                         hazardsRef.current.push({ type: 'crater', x: e.x, y: e.y, radius: e.radius * 0.7, expiry: now + 15000, points });
                    }
                    eventsRef.current.splice(i, 1);
                }
            }
            for (let i = hazardsRef.current.length - 1; i >= 0; i--) {
                if (hazardsRef.current[i].expiry && now > hazardsRef.current[i].expiry) {
                    hazardsRef.current.splice(i, 1);
                }
            }

            // 2. POWERUPS
            if (powerUpsRef.current.length < 6 && Math.random() < 0.01) {
                const pos = getSafeSpawnPosition(obstaclesRef.current, 30);
                powerUpsRef.current.push({
                    id: Math.random().toString(),
                    type: Object.values(PowerUpType)[Math.floor(Math.random() * 6)],
                    x: pos.x, y: pos.y, spawnTime: now
                });
            }

            // 3. VIRUS-0 AI (Chases nearest Healthy)
            botsRef.current.forEach(bot => {
                const ai = botAIStates.current[bot.id];
                if (!ai) return;

                if (now > ai.nextDecisionTime) {
                    ai.nextDecisionTime = now + 200 + Math.random() * 300;
                    
                    let dx = 0, dy = 0;
                    if (ai.isWandering) {
                        dx = Math.cos(ai.wanderAngle); dy = Math.sin(ai.wanderAngle);
                        if (Math.random() < 0.1) ai.isWandering = false;
                    } else {
                        let target: any = null;
                        let minDist = Infinity;
                        
                        // Check local player
                        if (myPlayerRef.current.state === PlayerState.HEALTHY) {
                             const d = Math.hypot(myPlayerRef.current.x - bot.x, myPlayerRef.current.y - bot.y);
                             if (d < minDist) { minDist = d; target = myPlayerRef.current; }
                        }
                        // Check remote players
                        otherPlayersRef.current.forEach(p => {
                            if (p.state === PlayerState.HEALTHY) {
                                const d = Math.hypot(p.x - bot.x, p.y - bot.y);
                                if (d < minDist) { minDist = d; target = p; }
                            }
                        });

                        if (target) {
                            dx = target.x - bot.x; dy = target.y - bot.y;
                        } else {
                             ai.isWandering = true;
                             ai.wanderAngle = Math.random() * Math.PI * 2;
                        }
                    }

                    if (dx !== 0 || dy !== 0) bot.angle = Math.atan2(dy, dx);
                }

                const dx = Math.cos(bot.angle);
                const dy = Math.sin(bot.angle);
                
                const dist = Math.hypot(bot.x - ai.lastX, bot.y - ai.lastY);
                if (dist < 0.5) ai.stuckTime += 50; else ai.stuckTime = 0;
                if (ai.stuckTime > 800) { ai.isWandering = true; ai.wanderAngle = Math.random() * Math.PI * 2; ai.stuckTime = 0; }
                ai.lastX = bot.x; ai.lastY = bot.y;

                const speed = bot.speed * ai.speedMultiplier * (bot.state === PlayerState.INFECTED ? INFECTED_SPEED_BOOST : 1);
                const nx = bot.x + dx * speed;
                const ny = bot.y + dy * speed;
                
                if (!obstaclesRef.current.some(o => checkRectCircleCollision(o, {x: nx, y: bot.y}, bot.radius))) bot.x = nx;
                if (!obstaclesRef.current.some(o => checkRectCircleCollision(o, {x: bot.x, y: ny}, bot.radius))) bot.y = ny;

                // Infect Local Player
                if (bot.state === PlayerState.INFECTED && myPlayerRef.current.state === PlayerState.HEALTHY) {
                    if (checkCircleCollision(bot, bot.radius, myPlayerRef.current, myPlayerRef.current.radius)) {
                        myPlayerRef.current.state = PlayerState.INFECTED;
                        audioManager.playInfect();
                    }
                }
            });

        }, 50);

        return () => clearInterval(hostLoop);
    }, []);

    const draw = () => {
        const cvs = canvasRef.current; if (!cvs) return;
        const ctx = cvs.getContext('2d'); if (!ctx) return;
        const now = Date.now();
        
        cvs.width = window.innerWidth; cvs.height = window.innerHeight;
        const me = myPlayerRef.current;
        const vw = cvs.width / zoom; const vh = cvs.height / zoom;
        const vx = Math.max(0, Math.min(ARENA_WIDTH - vw, me.x - vw / 2));
        const vy = Math.max(0, Math.min(ARENA_HEIGHT - vh, me.y - vh / 2));

        // BG
        ctx.fillStyle = '#020617'; ctx.fillRect(0,0,cvs.width,cvs.height);
        
        ctx.save(); 
        ctx.scale(zoom, zoom); 
        ctx.translate(-Math.round(vx), -Math.round(vy));

        // Grid
        ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1;
        for(let x=0; x<=ARENA_WIDTH; x+=200) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,ARENA_HEIGHT); ctx.stroke(); }
        for(let y=0; y<=ARENA_HEIGHT; y+=200) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(ARENA_WIDTH,y); ctx.stroke(); }

        // Hazards (Craters)
        hazardsRef.current.forEach(h => {
             ctx.save();
             const alpha = h.expiry ? Math.max(0, (h.expiry - now) / 5000) : 1;
             ctx.globalAlpha = Math.min(1, alpha);
             const grad = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, h.radius);
             grad.addColorStop(0, '#020617'); grad.addColorStop(0.6, '#450a0a'); grad.addColorStop(1, '#991b1b');
             ctx.fillStyle = grad; ctx.beginPath();
             h.points.forEach((pt, idx) => { if(idx === 0) ctx.moveTo(h.x + pt.x, h.y + pt.y); else ctx.lineTo(h.x + pt.x, h.y + pt.y); });
             ctx.closePath(); ctx.fill(); ctx.restore();
        });

        // Events
        eventsRef.current.forEach(e => {
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

        // Powerups
        powerUpsRef.current.forEach(pu => {
            const config = (POWERUP_CONFIG as any)[pu.type];
            if (config) { 
                ctx.fillStyle = config.color; ctx.font = 'bold 42px Orbitron'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(config.icon, pu.x, pu.y);
            }
        });

        // Obstacles (HIGH FIDELITY from GameArena)
        obstaclesRef.current.forEach(o => {
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

        // Entities Draw Function
        const drawEntity = (p: RemotePlayer | Player, isLocal: boolean) => {
            ctx.save();
            
            // Interpolate Remote
            if (!isLocal && 'targetX' in p) {
                const rp = p as RemotePlayer;
                const dx = rp.targetX - rp.x; const dy = rp.targetY - rp.y;
                if (Math.hypot(dx, dy) > 1) { rp.x += dx * 0.3; rp.y += dy * 0.3; } else { rp.x = rp.targetX; rp.y = rp.targetY; }
            }
            
            // Visual Configs
            const isVirusZero = p.name === 'VIRUS-0';
            const isTrapped = now < p.trappedUntil;
            const forceInfectedLook = isVirusZero || p.state === PlayerState.INFECTED;
            
            // Color Logic Matches GameArena.tsx (P1 = Cyan/White, Remote = Silver, Infected = Red)
            const bodyColor = forceInfectedLook ? COLORS.INFECTED_BODY : (isLocal ? COLORS.PLAYER_P1_BODY : COLORS.HEALTHY_BODY);
            const borderColor = forceInfectedLook ? COLORS.INFECTED_BORDER : (isLocal ? COLORS.PLAYER_P1_BORDER : COLORS.HEALTHY_BORDER);

            if(p.activePowerUps[PowerUpType.INVISIBLE] && now < p.activePowerUps[PowerUpType.INVISIBLE]) {
                 ctx.globalAlpha = isLocal ? 0.5 : 0.1;
            }

            // Trails
            if (p.trail && p.trail.length > 0) {
                for(let i=1; i<p.trail.length; i++) {
                  ctx.beginPath(); ctx.moveTo(p.trail[i-1].x, p.trail[i-1].y); ctx.lineTo(p.trail[i].x, p.trail[i].y);
                  ctx.strokeStyle = POWERUP_CONFIG.SPEED.color; ctx.lineWidth = i / 1.5; ctx.stroke();
                }
            }

            ctx.fillStyle = bodyColor; ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = borderColor; ctx.lineWidth = isLocal ? 5 : 3; ctx.stroke();
            
            if (isVirusZero) {
                 ctx.fillStyle = '#a855f7'; ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI*2); ctx.fill();
            }

            // Power-up Visuals
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

            ctx.fillStyle = '#fff'; ctx.font = '10px monospace'; ctx.textAlign = 'center'; ctx.fillText(p.name, p.x, p.y - 35);
            ctx.restore();
        };

        botsRef.current.forEach(b => drawEntity(b, false));
        otherPlayersRef.current.forEach(p => drawEntity(p, false));
        drawEntity(me, true);

        ctx.restore();
        
        // Minimap
        const mc = minimapCanvasRef.current;
        if(mc) {
            const mctx = mc.getContext('2d');
            if(mctx) {
                mctx.clearRect(0,0,mc.width,mc.height);
                mctx.fillStyle='rgba(15,23,42,0.6)'; mctx.fillRect(0,0,mc.width,mc.height);
                const s = mc.width / ARENA_WIDTH;
                
                // Draw Events on Minimap
                eventsRef.current.forEach(e => {
                     if (e.type === EventType.FLOOD) {
                         mctx.fillStyle = 'rgba(14, 165, 233, 0.3)'; mctx.beginPath(); mctx.arc(e.x*s, e.y*s, e.radius*s, 0, Math.PI*2); mctx.fill();
                     }
                });

                const drawDot = (p: any, c: string) => { mctx.fillStyle=c; mctx.beginPath(); mctx.arc(p.x*s, p.y*s, 2, 0, Math.PI*2); mctx.fill(); };
                botsRef.current.forEach(b => drawDot(b, '#f43f5e'));
                otherPlayersRef.current.forEach(p => drawDot(p, p.state===PlayerState.INFECTED ? '#ef4444' : '#cbd5e1'));
                drawDot(me, me.state===PlayerState.INFECTED ? '#ef4444' : '#22d3ee');
            }
        }
    };

    // --- CLIENT INPUT & PHYSICS LOOP ---
    useEffect(() => {
        let frameId: number;
        const keys: Record<string, boolean> = {};
        const onKd = (e: KeyboardEvent) => keys[e.code] = true;
        const onKu = (e: KeyboardEvent) => keys[e.code] = false;
        window.addEventListener('keydown', onKd); window.addEventListener('keyup', onKu);
        
        const loop = () => {
            const p = myPlayerRef.current;
            const now = Date.now();

            if (now < p.stunnedUntil || now < p.trappedUntil) {
                 draw();
                 frameId = requestAnimationFrame(loop);
                 return;
            }

            let dx = 0, dy = 0;
            if (keys['KeyW'] || keys['ArrowUp']) dy = -1;
            if (keys['KeyS'] || keys['ArrowDown']) dy = 1;
            if (keys['KeyA'] || keys['ArrowLeft']) dx = -1;
            if (keys['KeyD'] || keys['ArrowRight']) dx = 1;
            if (joystickState.current.active) { dx = joystickState.current.vectorX; dy = joystickState.current.vectorY; }
            
            // Check weather effect speed penalties
            let speedFactor = 1.0;
            eventsRef.current.forEach(e => { if (e.type === EventType.FLOOD && Math.hypot(p.x - e.x, p.y - e.y) < e.radius) speedFactor = 0.4; });

            const mag = Math.hypot(dx, dy);
            if (mag > 0.01) {
                let speed = p.speed * speedFactor;
                if (p.activePowerUps[PowerUpType.SPEED] && now < p.activePowerUps[PowerUpType.SPEED]) speed *= 1.7;
                const moveStep = Math.min(mag, 1) * speed;
                const nx = p.x + (dx/mag) * moveStep; const ny = p.y + (dy/mag) * moveStep;
                
                let cx = Math.max(p.radius, Math.min(ARENA_WIDTH - p.radius, nx));
                let cy = Math.max(p.radius, Math.min(ARENA_HEIGHT - p.radius, ny));
                if (!obstaclesRef.current.some(o => checkRectCircleCollision(o, {x:cx, y:p.y}, p.radius))) p.x = cx;
                if (!obstaclesRef.current.some(o => checkRectCircleCollision(o, {x:p.x, y:cy}, p.radius))) p.y = cy;
                
                // Trail update
                if (p.activePowerUps[PowerUpType.SPEED] && now < p.activePowerUps[PowerUpType.SPEED]) {
                     p.trail.push({ x: p.x, y: p.y }); if (p.trail.length > 15) p.trail.shift();
                } else if(p.trail.length>0) p.trail.shift();
            }

            // Client Item Collect Check (Optimistic)
            for (const pu of powerUpsRef.current) {
                if (checkCircleCollision(p, p.radius, pu, 35)) {
                    if (!collectedItemsRef.current.has(pu.id)) {
                        collectedItemsRef.current.add(pu.id);
                        // Apply locally immediately
                        p.activePowerUps[pu.type] = now + 8000;
                        audioManager.playCollect();
                        // Tell Host
                        socket.emit('v2_state', { type: 'v2_collect_item', roomId: roomId, id: p.id, itemId: pu.id });
                    }
                }
            }

            draw();
            frameId = requestAnimationFrame(loop);
        };
        frameId = requestAnimationFrame(loop);
        return () => { cancelAnimationFrame(frameId); window.removeEventListener('keydown', onKd); window.removeEventListener('keyup', onKu); };
    }, []);

    // Touch Handlers
    const handleTouchStart = (e: React.TouchEvent) => {
        const t = e.touches[0];
        joystickState.current = { active: true, baseX: t.clientX, baseY: t.clientY, vectorX: 0, vectorY: 0 };
        setJoystickVisualOffset({ x: 0, y: 0, active: true });
    };
    const handleTouchMove = (e: React.TouchEvent) => {
        if (!joystickState.current.active) return;
        const t = e.touches[0];
        const dx = t.clientX - joystickState.current.baseX;
        const dy = t.clientY - joystickState.current.baseY;
        const dist = Math.min(50, Math.hypot(dx, dy));
        const angle = Math.atan2(dy, dx);
        joystickState.current.vectorX = Math.cos(angle) * (dist/50);
        joystickState.current.vectorY = Math.sin(angle) * (dist/50);
        setJoystickVisualOffset({ x: Math.cos(angle)*dist, y: Math.sin(angle)*dist, active: true });
    };
    const handleTouchEnd = () => {
        joystickState.current.active = false;
        joystickState.current.vectorX = 0;
        joystickState.current.vectorY = 0;
        setJoystickVisualOffset({ x: 0, y: 0, active: false });
    };

  return (
    <div className="relative w-full h-full bg-slate-950 overflow-hidden touch-none select-none">
        <canvas ref={canvasRef} className="block w-full h-full" />
        
        <HUD 
            gameTime={gameTime} 
            healthyCount={1 + Array.from(otherPlayersRef.current.values()).filter((p: RemotePlayer) => p.state === PlayerState.HEALTHY).length}
            infectedCount={Array.from(otherPlayersRef.current.values()).filter((p: RemotePlayer) => p.state === PlayerState.INFECTED).length + Array.from(botsRef.current.values()).filter((b:RemotePlayer) => b.state === PlayerState.INFECTED).length}
            player={myPlayerRef.current}
            minimapCanvasRef={minimapCanvasRef}
            isSuddenDeath={false}
            audioEnabled={audioEnabled}
            setAudioEnabled={setAudioEnabled}
            onExit={onExit}
        />

        {isMobile && (
            <div 
                className="absolute bottom-10 left-10 w-32 h-32 flex items-center justify-center z-50"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                <div className="absolute inset-0 bg-slate-800/30 backdrop-blur-md rounded-full border border-slate-700/50" />
                <div 
                    className="w-12 h-12 bg-cyan-500/80 rounded-full transition-transform duration-75 shadow-lg shadow-cyan-500/20"
                    style={{ transform: `translate(${joystickVisualOffset.x}px, ${joystickVisualOffset.y}px)` }}
                />
            </div>
        )}
    </div>
  );
};

export default MultiplayerArena;
