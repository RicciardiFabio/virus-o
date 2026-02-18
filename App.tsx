
import React, { useState, useEffect, useRef } from 'react';
import { GameStatus, MultiplayerSessionData } from './types';
import Lobby from './components/Lobby';
import MultiplayerLobby from './components/MultiplayerLobby'; 
import WaitingRoom from './components/WaitingRoom'; 
import MultiplayerArena from './components/MultiplayerArena'; 
import GameArena from './components/GameArena';
import { audioManager, saveScore } from './utils';
import { gamepadManager } from './gamepad'; 
import { Trophy, ShieldAlert, Home, Play, HelpCircle, Terminal } from 'lucide-react';
import { socketService } from './socket';

const App: React.FC = () => {
  const [status, setStatus] = useState<GameStatus>(GameStatus.LOBBY);
  
  // Nome giocatore con persistenza
  const [playerName, setPlayerName] = useState<string>(() => {
    const stored = localStorage.getItem('virus0_name');
    if (stored && stored.trim() !== '') return stored;
    return `Survivor-${Math.floor(1000 + Math.random() * 9000)}`;
  });

  const [botCount, setBotCount] = useState<number>(10);
  const [audioEnabled, setAudioEnabled] = useState<boolean>(true);
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const [gameOverData, setGameOverData] = useState<{ winner: string; time: number } | null>(null);
  const [currentRoom, setCurrentRoom] = useState<any | null>(null);
  
  // STATO PER PASSAGGIO DATI MULTIPLAYER (Handshake Handoff)
  const [sessionData, setSessionData] = useState<MultiplayerSessionData | null>(null);

  useEffect(() => {
    localStorage.setItem('virus0_name', playerName);
  }, [playerName]);

  useEffect(() => {
    audioManager.setEnabled(audioEnabled);
    if (status === GameStatus.LOBBY || status === GameStatus.MULTIPLAYER_LOBBY) {
      audioManager.startMusic(false);
    }
  }, [audioEnabled, status]);

  // --- AZIONI DI NAVIGAZIONE ---
  
  const startGame = () => {
    audioManager.startMusic(true);
    setGameOverData(null);
    setStatus(GameStatus.PLAYING);
  };

  const handleGameOver = (winner: string, time: number) => {
    audioManager.stopMusic();
    if (winner === playerName) audioManager.playWin(); else audioManager.playLose();
    saveScore({ playerName, score: time, timestamp: Date.now(), botCount });
    setGameOverData({ winner, time });
    setStatus(GameStatus.GAME_OVER);
  };

  const returnToLobby = () => {
    if (currentRoom) {
      console.log("Leaving room:", currentRoom.id);
      socketService.emit('leave_room', { roomId: currentRoom.id });
    }

    setTimeout(() => {
        socketService.off('rooms_list');
        socketService.off('v2_welcome');
        setStatus(GameStatus.LOBBY);
        setGameOverData(null);
        setCurrentRoom(null);
        setSessionData(null); // Reset session data
    }, 300);
  };

  const handleEnterRoom = (roomData: any) => {
    console.log("App: Entering Room", roomData);
    setCurrentRoom(roomData);
    setStatus(GameStatus.WAITING_ROOM);
  };

  return (
    <div className="relative w-full h-screen bg-slate-950 overflow-hidden text-slate-100 font-sans">
      
      {status === GameStatus.LOBBY && (
        <Lobby 
          onStart={startGame}
          playerName={playerName}
          setPlayerName={setPlayerName}
          botCount={botCount}
          setBotCount={setBotCount}
          audioEnabled={audioEnabled}
          setAudioEnabled={setAudioEnabled}
          onShowHelp={() => setShowHelp(true)}
          onGoOnline={() => {
            socketService.connect();
            setStatus(GameStatus.MULTIPLAYER_LOBBY);
          }}
        />
      )}

      {status === GameStatus.MULTIPLAYER_LOBBY && (
        <MultiplayerLobby 
          playerName={playerName}
          onBack={() => setStatus(GameStatus.LOBBY)}
          onEnterRoom={handleEnterRoom}
        />
      )}
      
      {status === GameStatus.WAITING_ROOM && currentRoom && (
        <WaitingRoom
          playerName={playerName}
          room={currentRoom}
          onStartGame={(data) => {
            setSessionData(data); // Salva i dati critici
            setStatus(GameStatus.MULTIPLAYER_PLAYING);
          }}
          onLeave={() => {
             socketService.emit('leave_room', { roomId: currentRoom.id });
             setCurrentRoom(null);
             setStatus(GameStatus.MULTIPLAYER_LOBBY);
          }}
        />
      )}

      {status === GameStatus.PLAYING && (
        <GameArena 
          playerName={playerName}
          botCount={botCount}
          audioEnabled={audioEnabled}
          setAudioEnabled={setAudioEnabled}
          onGameOver={handleGameOver}
          onExit={returnToLobby}
        />
      )}

      {status === GameStatus.MULTIPLAYER_PLAYING && sessionData && (
        <MultiplayerArena 
          playerName={playerName}
          roomId={currentRoom?.id || ''}
          audioEnabled={audioEnabled}
          setAudioEnabled={setAudioEnabled}
          onExit={returnToLobby}
          sessionData={sessionData} // Passa i dati direttamente
        />
      )}

      {status === GameStatus.GAME_OVER && gameOverData && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-xl">
          <div className="bg-slate-900 border-2 border-indigo-500/30 p-10 rounded-[2.5rem] shadow-2xl max-w-md w-full text-center space-y-6">
            <div className="w-20 h-20 mx-auto bg-slate-800 rounded-full flex items-center justify-center shadow-inner">
              {gameOverData.winner === playerName ? <Trophy className="w-12 h-12 text-yellow-400" /> : <ShieldAlert className="w-12 h-12 text-rose-500" />}
            </div>
            <h2 className={`text-4xl font-black uppercase italic tracking-tighter ${gameOverData.winner === playerName ? 'text-cyan-400' : 'text-rose-500'}`}>
              {gameOverData.winner === playerName ? 'Mission Clear' : 'Signal Lost'}
            </h2>
            <div className="space-y-1 bg-slate-950/50 py-4 rounded-2xl border border-slate-800">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Survival Time</p>
              <p className="text-3xl font-black text-slate-100 font-mono">{Math.floor(gameOverData.time / 60)}:{(gameOverData.time % 60).toString().padStart(2, '0')}</p>
            </div>
            <div className="pt-4 flex flex-col gap-3">
              <button onClick={startGame} className="w-full py-4 bg-indigo-600 text-white font-black rounded-2xl active:scale-95 transition-all uppercase tracking-widest text-sm shadow-lg shadow-indigo-500/20">
                Re-Deploy (Offline)
              </button>
              <button onClick={returnToLobby} className="w-full py-4 bg-slate-800 text-slate-400 font-black rounded-2xl active:scale-95 transition-all uppercase tracking-widest text-sm">
                Return to Base
              </button>
            </div>
          </div>
        </div>
      )}

      {showHelp && (
        <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-slate-900 border-2 border-slate-800 p-8 rounded-[2rem] max-w-2xl w-full relative shadow-2xl">
            <button onClick={() => setShowHelp(false)} className="absolute top-6 right-6 text-slate-500 hover:text-white transition-colors">
                <span className="text-2xl">×</span>
            </button>
            <div className="space-y-6">
                <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
                    <Terminal className="text-cyan-500 w-6 h-6" />
                    <h3 className="text-2xl font-black text-white uppercase italic">Field Protocol</h3>
                </div>
                <div className="grid grid-cols-2 gap-4 text-xs font-mono text-slate-400 uppercase tracking-tight">
                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                        <p className="text-cyan-500 mb-2">Movement</p>
                        <p>WASD or Arrow Keys</p>
                    </div>
                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                        <p className="text-rose-500 mb-2">Objective</p>
                        <p>Avoid infection. Survive longest.</p>
                    </div>
                </div>
                <button onClick={() => setShowHelp(false)} className="w-full py-4 bg-cyan-600 rounded-xl font-black uppercase tracking-widest text-sm">Acknowledge</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
