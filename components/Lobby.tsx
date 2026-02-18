import React, { useState, useEffect } from 'react';
import { Play, Trophy, HelpCircle, Volume2, VolumeX, User, Bot, Terminal, Globe, Loader2 } from 'lucide-react';
import Leaderboard from './Leaderboard';
import { socketService, socket } from '../socket';

interface LobbyProps {
  onStart: () => void;
  playerName: string;
  setPlayerName: (n: string) => void;
  botCount: number;
  setBotCount: (c: number) => void;
  audioEnabled: boolean;
  setAudioEnabled: (e: boolean) => void;
  onShowHelp: () => void;
  onGoOnline: (roomId: string) => void; // Modificata per passare l'ID
}

const Lobby: React.FC<LobbyProps> = ({ 
  onStart, playerName, setPlayerName, botCount, setBotCount, audioEnabled, setAudioEnabled, onShowHelp, onGoOnline 
}) => {
  const [showRankings, setShowRankings] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  // Aggiungiamo uno stato per forzare il re-render al cambio connessione
  const [isConnected, setIsConnected] = useState(socket.connected);

  useEffect(() => {
    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  // Funzione per generare un ID stanza veloce e unirsi
  const handleQuickOnline = () => {
    if (!playerName.trim()) {
      alert("Inserisci un nome prima di connetterti!");
      return;
    }
    
    setIsConnecting(true);
    
    // 1. Connetti il socket
    socketService.connect();
    
    // 2. Genera un ID stanza casuale (es: VZ-123)
    const randomId = "VZ-" + Math.floor(100 + Math.random() * 900);
    
    console.log("Inizializzazione Multiplayer per stanza:", randomId);
    
    // 3. Comunica al componente padre (App.tsx) di passare alla WaitingRoom
    // Questo farà scattare il componente WaitingRoom che abbiamo sistemato prima
    setTimeout(() => {
        onGoOnline(randomId);
    }, 500);
  };

  return (
    <div className="relative z-10 w-full h-full min-h-screen flex flex-col items-center justify-center p-4 bg-slate-950 overflow-y-auto overflow-x-hidden font-sans">
      {/* Background decoration */}
      <div className="fixed inset-0 -z-20 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:40px_40px] opacity-20" />
      <div className="fixed top-0 left-0 w-full h-full bg-gradient-to-b from-cyan-500/5 to-transparent pointer-events-none -z-10" />
      
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none -z-10">
        <img 
          src="https://websitedefault.it/game_viruszero/icona-virus-zero.png" 
          alt="" 
          className="w-[85vmin] h-[85vmin] object-contain opacity-10 blur-sm animate-pulse" 
        />
      </div>

      <div className="absolute top-4 right-4 z-50">
        <button 
          onClick={() => setAudioEnabled(!audioEnabled)}
          className="bg-slate-900/80 backdrop-blur-md border border-slate-800 p-2 rounded-xl text-slate-400 hover:text-cyan-400 transition-all active:scale-95 shadow-xl flex items-center gap-2"
        >
          {audioEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
        </button>
      </div>

      <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center relative z-20 py-6">
        
        {/* Left Section */}
        <div className="space-y-6 text-center lg:text-left">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-cyan-500/10 border border-cyan-500/20 rounded-full">
              <Terminal className="w-3 h-3 text-cyan-500" />
              <span className="text-[10px] uppercase font-black tracking-widest text-cyan-500">System Online</span>
            </div>
            
            <h1 className="text-6xl sm:text-7xl md:text-8xl font-black tracking-tighter italic text-slate-100 leading-none drop-shadow-2xl">
              VIRUS<span className="text-cyan-500 inline-block animate-pulse">-</span>0
            </h1>

            <p className="text-slate-400 font-medium max-w-sm text-sm leading-relaxed mx-auto lg:mx-0">
              Protocollo di sopravvivenza neurale attivo. Sconfiggi l'infezione o diventa parte del codice.
            </p>
          </div>

          <div className="flex flex-col gap-4">
             <div className="flex flex-col sm:flex-row gap-3">
                <button 
                  onClick={onStart} 
                  className="px-8 py-4 bg-white text-black font-black rounded-2xl transition-all hover:bg-cyan-400 active:scale-95 flex items-center justify-center gap-2 text-sm uppercase tracking-widest"
                >
                  <Play className="w-4 h-4 fill-current" /> Solo Mission
                </button>
                
                <button 
                  onClick={() => setShowRankings(!showRankings)} 
                  className="px-8 py-4 bg-slate-900 border border-slate-800 text-slate-400 hover:text-white font-black rounded-2xl transition-all hover:bg-slate-800 flex items-center justify-center gap-2 active:scale-95 text-sm"
                >
                  <Trophy className="w-4 h-4" /> Rankings
                </button>
             </div>
             
             {/* BOTTONE MULTIPLAYER AGGIORNATO */}
             <button 
               onClick={handleQuickOnline}
               disabled={isConnecting}
               className="w-full sm:w-auto px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl transition-all shadow-lg shadow-indigo-500/30 hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-3 text-sm uppercase tracking-widest border border-indigo-400/30 disabled:opacity-50"
             >
               {isConnecting ? (
                 <Loader2 className="w-5 h-5 animate-spin" />
               ) : (
                 <Globe className="w-5 h-5 text-indigo-300" />
               )}
               {isConnecting ? 'Linking Neural Net...' : 'Multiplayer Online'}
             </button>
          </div>

          <div className="flex justify-center lg:justify-start">
             <button onClick={onShowHelp} className="flex items-center gap-2 text-slate-500 hover:text-cyan-400 transition-colors text-[10px] font-black uppercase tracking-[0.2em]">
              <HelpCircle className="w-3 h-3" /> User Manual
            </button>
          </div>
        </div>

        {/* Right Section - Settings Box */}
        <div className="flex justify-center items-center w-full px-2">
          {showRankings ? (
             <div className="w-full h-[450px] bg-slate-900/80 rounded-[2rem] border-2 border-slate-800 p-4 overflow-hidden shadow-2xl">
               <Leaderboard />
             </div>
          ) : (
            <div className="relative w-full max-w-md">
               {/* Decorative Logo */}
               <div className="absolute -top-24 right-0 lg:-top-32 lg:-right-10 pointer-events-none z-10 opacity-40">
                <img 
                  src="https://websitedefault.it/game_viruszero/logo-virus-zero.png" 
                  alt="Logo"
                  className="w-48 lg:w-72 h-auto object-contain"
                />
              </div>

              <div className="bg-slate-900/60 backdrop-blur-2xl border-2 border-slate-800/50 p-6 rounded-[2.5rem] shadow-2xl space-y-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 blur-[50px] -z-10" />
                
                <div className="space-y-3">
                  <label className="text-[10px] uppercase font-black tracking-[0.2em] text-slate-500 flex items-center gap-2">
                    <User className="w-3 h-3 text-cyan-500" /> Identity Signal
                  </label>
                  <input 
                    type="text" 
                    value={playerName} 
                    onChange={(e) => setPlayerName(e.target.value)} 
                    maxLength={15}
                    placeholder="ENTER CODENAME..."
                    className="w-full bg-slate-950 border border-slate-800 p-4 rounded-2xl text-xl font-black text-slate-100 outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all placeholder:text-slate-900 uppercase italic"
                  />
                </div>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    <label className="flex items-center gap-2"><Bot className="w-3 h-3 text-rose-500" /> Threat Level</label>
                    <span className="text-rose-500">{botCount} Units</span>
                  </div>
                  <input 
                    type="range" 
                    min="5" 
                    max="50" 
                    step="5" 
                    value={botCount} 
                    onChange={(e) => setBotCount(parseInt(e.target.value))} 
                    className="w-full h-2 bg-slate-800 rounded-lg accent-rose-500 cursor-pointer appearance-none" 
                  />
                </div>

                <div className="p-4 bg-slate-950/60 rounded-2xl border border-slate-800/50 flex items-start gap-3">
                  <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full mt-1.5 animate-pulse" />
                  <p className="text-[9px] text-slate-400 leading-relaxed font-mono uppercase">
                    Network: {isConnected ? 'Link Established' : 'Scanning for nodes...'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Lobby;