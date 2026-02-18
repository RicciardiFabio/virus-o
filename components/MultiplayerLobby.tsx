import React, { useState, useEffect } from 'react';
import { Globe, Plus, ArrowLeft, Users, Shield, Terminal, Loader2, RefreshCw } from 'lucide-react';
import { socketService } from '../socket';

interface MultiplayerLobbyProps {
  playerName: string;
  onBack: () => void;
  onEnterRoom: (roomData: any) => void;
}

const MultiplayerLobby: React.FC<MultiplayerLobbyProps> = ({ playerName, onBack, onEnterRoom }) => {
  const [rooms, setRooms] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 1. Chiediamo la lista stanze all'avvio e ogni 3 secondi
  useEffect(() => {
    const fetchRooms = () => {
      socketService.emit('get_rooms', {});
    };

    const handleRoomsList = (roomsList: any[]) => {
      console.log("📡 Stanze ricevute dal server:", roomsList);
      setRooms(roomsList);
      setIsLoading(false);
    };

    socketService.on('rooms_list', handleRoomsList);
    fetchRooms(); // Primo carico

    const interval = setInterval(fetchRooms, 3000);

    return () => {
      socketService.off('rooms_list');
      clearInterval(interval);
    };
  }, []);

  // 2. Funzione per creare una nuova stanza
  const createRoom = () => {
    const newRoomId = "VZ-" + Math.random().toString(36).substring(2, 6).toUpperCase();
    console.log("🚀 Creazione stanza:", newRoomId);
    
    // Passiamo i dati al componente App.tsx che ci sposterà nella WaitingRoom
    onEnterRoom({
      id: newRoomId,
      hostId: '', // Verrà assegnato dal server al v2_hello
      players: []
    });
  };

  // 3. Funzione per unirsi a una stanza esistente
  const joinRoom = (roomId: string) => {
    onEnterRoom({
      id: roomId,
      hostId: '',
      players: []
    });
  };

  return (
    <div className="relative z-10 w-full h-full min-h-screen flex flex-col items-center justify-center p-6 bg-slate-950 font-sans">
      <div className="max-w-4xl w-full space-y-8 animate-in fade-in zoom-in duration-500">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4">
            <button 
              onClick={onBack}
              className="p-3 bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 hover:text-white transition-all hover:bg-slate-800"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-4xl font-black text-white italic tracking-tighter uppercase">Net Terminal</h2>
              <p className="text-indigo-400 text-xs font-mono uppercase tracking-widest">Active Identity: {playerName}</p>
            </div>
          </div>

          <button 
            onClick={createRoom}
            className="group flex items-center gap-3 px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl transition-all shadow-lg shadow-indigo-500/20 uppercase tracking-widest text-sm"
          >
            <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />
            Create Neural Link
          </button>
        </div>

        {/* Room List Container */}
        <div className="bg-slate-900/50 backdrop-blur-xl border-2 border-slate-800 rounded-[2.5rem] p-8 min-h-[400px] relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-30" />
          
          <div className="flex items-center gap-2 mb-6 text-slate-500">
            <Globe className="w-4 h-4 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em]">Global Arena Nodes</span>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 space-y-4">
              <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
              <p className="text-xs font-mono text-slate-600 uppercase tracking-widest animate-pulse">Scanning frequencies...</p>
            </div>
          ) : rooms.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center space-y-4">
              <div className="p-6 bg-slate-950 rounded-full border border-slate-800">
                <RefreshCw className="w-8 h-8 text-slate-800" />
              </div>
              <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">No active sectors found</p>
              <p className="text-[10px] text-slate-600 max-w-[200px] uppercase">Initialize a new node to start a session</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {rooms.map((room) => (
                <div 
                  key={room.id}
                  onClick={() => joinRoom(room.id)}
                  className="group cursor-pointer bg-slate-950/80 border border-slate-800 p-6 rounded-3xl hover:border-indigo-500/50 transition-all hover:translate-y-[-2px] relative overflow-hidden"
                >
                  <div className="flex justify-between items-start relative z-10">
                    <div>
                      <h4 className="text-indigo-400 font-mono text-xs mb-1">ID: {room.id}</h4>
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-slate-500" />
                        <span className="text-xl font-black text-slate-100 uppercase italic">Active Squad</span>
                      </div>
                    </div>
                    <div className="bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20 text-indigo-500 text-xs font-black">
                      {room.playerCount} / 4
                    </div>
                  </div>
                  
                  <div className="mt-4 flex items-center gap-2 text-[10px] font-black text-slate-600 uppercase tracking-widest group-hover:text-indigo-400 transition-colors">
                    <Terminal className="w-3 h-3" />
                    Join Connection
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-center gap-8 text-slate-600">
          <div className="flex items-center gap-2">
            <Shield className="w-3 h-3" />
            <span className="text-[8px] uppercase font-black tracking-widest">Encrypted Link</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-ping" />
            <span className="text-[8px] uppercase font-black tracking-widest text-green-500/50">Server Online</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MultiplayerLobby;