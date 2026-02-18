
import React from 'react';
import { Player, PowerUpType, PlayerState } from '../types';
import { POWERUP_CONFIG, ARENA_WIDTH, ARENA_HEIGHT } from '../constants';
import { Timer, Users, Activity, Shield, Zap, Ghost, Siren, Pill, Snowflake, Radio, Map as MapIcon, Volume2, VolumeX, Home } from 'lucide-react';

interface HUDProps {
  gameTime: number;
  healthyCount: number;
  infectedCount: number;
  player: Player;
  minimapCanvasRef: React.RefObject<HTMLCanvasElement>;
  isSuddenDeath: boolean;
  audioEnabled: boolean;
  setAudioEnabled: (e: boolean) => void;
  onExit: () => void;
}

const HUD: React.FC<HUDProps> = ({ gameTime, healthyCount, infectedCount, player, minimapCanvasRef, isSuddenDeath, audioEnabled, setAudioEnabled, onExit }) => {
  if (!player) return null;

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getPowerUpIcon = (type: PowerUpType) => {
    switch (type) {
      case PowerUpType.SPEED: return <Zap className="w-4 h-4" />;
      case PowerUpType.SHIELD: return <Shield className="w-4 h-4" />;
      case PowerUpType.INVISIBLE: return <Ghost className="w-4 h-4" />;
      case PowerUpType.ANTIVIRUS: return <Pill className="w-4 h-4" />;
      case PowerUpType.FREEZE: return <Snowflake className="w-4 h-4" />;
      case PowerUpType.RADIATION: return <Radio className="w-4 h-4" />;
      default: return <Activity className="w-4 h-4" />;
    }
  };

  return (
    <div className="absolute inset-0 pointer-events-none select-none p-6 font-mono">
      {/* Top Stats */}
      <div className="absolute top-6 left-6 flex flex-col gap-2">
        <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 px-4 py-2 rounded-xl flex items-center gap-6 shadow-xl">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-cyan-400" />
            <span className="text-cyan-400 font-bold">{healthyCount}</span>
            <span className="text-[9px] text-slate-500 uppercase font-black tracking-tight">Alive</span>
          </div>
          <div className="w-px h-4 bg-slate-800" />
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-rose-500" />
            <span className="text-rose-500 font-bold">{infectedCount}</span>
            <span className="text-[9px] text-slate-500 uppercase font-black tracking-tight">Viruses</span>
          </div>
        </div>
        {isSuddenDeath && (
          <div className="bg-amber-500 text-slate-950 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-[0.2em] flex items-center gap-2 animate-pulse">
            <Siren className="w-3 h-3" /> Sudden Death Active
          </div>
        )}
      </div>

      {/* Timer, Audio Toggle, and Home Button */}
      <div className="absolute top-6 right-6 flex items-center gap-3">
        <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 px-4 py-2 rounded-xl flex items-center gap-3 shadow-xl">
          <Timer className="w-4 h-4 text-slate-500" />
          <span className="text-lg font-bold text-white tracking-wider italic">{formatTime(gameTime)}</span>
        </div>
        <button 
          onClick={() => setAudioEnabled(!audioEnabled)}
          className="pointer-events-auto bg-slate-900/40 backdrop-blur-md border border-slate-800 p-2.5 rounded-xl text-slate-400 hover:text-cyan-400 transition-all active:scale-95 shadow-xl"
        >
          {audioEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
        </button>
        <button 
          onClick={onExit}
          className="pointer-events-auto bg-slate-900/40 backdrop-blur-md border border-slate-800 p-2.5 rounded-xl text-slate-400 hover:text-cyan-400 transition-all active:scale-95 shadow-xl"
        >
          <Home className="w-5 h-5" />
        </button>
      </div>

      {/* Power-ups (Moved to Top Right below Timer) */}
      <div className="absolute top-24 right-6 flex flex-col items-end gap-2 max-h-[40vh] overflow-hidden">
        {Object.entries(player.activePowerUps || {}).map(([type, expiry]) => {
          const timeLeftMs = (expiry as number) - Date.now();
          const timeLeftSec = Math.max(0, Math.ceil(timeLeftMs / 1000));
          if (timeLeftSec <= 0) return null;
          const config = (POWERUP_CONFIG as any)[type];
          if (!config) return null;
          const progress = (timeLeftMs / 8000) * 100;
          return (
            <div key={type} className="flex items-center gap-3 bg-slate-950/20 backdrop-blur-sm border border-white/5 p-2 rounded-lg animate-in slide-in-from-right duration-500 min-w-[150px]">
              <div className="p-2 rounded-lg" style={{ backgroundColor: `${config.color}15`, color: config.color }}>
                {getPowerUpIcon(type as PowerUpType)}
              </div>
              <div className="flex-1 min-w-0 text-right">
                <span className="text-[8px] text-slate-300 uppercase font-black tracking-widest block truncate">{config.label}</span>
                <div className="flex items-center justify-end gap-2">
                  <span className="text-[10px] font-black text-white italic">{timeLeftSec}s</span>
                  <div className="w-16 h-1 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full transition-all duration-100 ease-linear float-right" style={{ width: `${progress}%`, backgroundColor: config.color }} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Minimap (Bottom Right) - Increased Transparency */}
      <div className="absolute bottom-6 right-6">
        <div className="bg-slate-950/30 opacity-70 backdrop-blur-md border border-slate-800/50 p-2 rounded-2xl shadow-2xl flex flex-col items-center hover:opacity-100 transition-opacity">
          <div className="flex items-center gap-2 mb-2 px-1 w-full">
            <MapIcon className="w-3 h-3 text-cyan-500" />
            <span className="text-[8px] uppercase font-black text-slate-500 tracking-widest">Live Scanner</span>
          </div>
          <div className="relative bg-slate-900/50 rounded-lg overflow-hidden border border-slate-800/50 shadow-inner" 
               style={{ width: 140, height: 140 / (ARENA_WIDTH / ARENA_HEIGHT) }}>
             <canvas 
               ref={minimapCanvasRef} 
               width={140} 
               height={140 / (ARENA_WIDTH / ARENA_HEIGHT)} 
               className="block"
             />
          </div>
        </div>
      </div>
    </div>
  );
};

export default HUD;
