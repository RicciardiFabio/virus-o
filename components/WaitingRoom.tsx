
import React, { useState, useEffect, useRef } from 'react';
import { socketService } from '../socket';
import { Users, Play, Loader2, Crown, LogOut, AlertTriangle } from 'lucide-react';
import { MultiplayerSessionData } from '../types';

interface PlayerInfo {
    id: string;
    name: string;
    isHost?: boolean;
}

interface WaitingRoomProps {
    playerName: string;
    room: { id: string; hostId: string; players: PlayerInfo[] };
    onStartGame: (data: MultiplayerSessionData) => void;
    onLeave: () => void;
}

const WaitingRoom: React.FC<WaitingRoomProps> = ({ playerName, room, onStartGame, onLeave }) => {
    const [players, setPlayers] = useState<PlayerInfo[]>([]);
    const [myId, setMyId] = useState<string>('');
    const [hostId, setHostId] = useState<string>(room.hostId || '');
    const hasJoined = useRef(false);

    useEffect(() => {
        console.log("[WaitingRoom] Avvio componente...");
        
        socketService.connect();

        const handleWelcome = (data: any) => {
            console.log("✅ Benvenuto ricevuto!", data);
            setPlayers(data.players || []);
            setHostId(data.hostId);
            setMyId(data.myAssignedId);
            hasJoined.current = true;
        };

        const handleNewPlayer = (player: PlayerInfo) => {
            console.log("👤 Nuovo giocatore:", player.name);
            setPlayers(prev => {
                if (prev.find(p => p.id === player.id)) return prev;
                return [...prev, player];
            });
        };

        const handlePlayerLeft = (data: { playerId: string }) => {
            setPlayers(prev => prev.filter(p => p.id !== data.playerId));
        };

        const handleHostChange = (data: { hostId: string, players: PlayerInfo[] }) => {
            setHostId(data.hostId);
            if (data.players) setPlayers(data.players);
        };

        const handleStartGame = () => {
            console.log("🚀 Start command received");
            onStartGame({
                myId: myId || socketService.socketId || 'unknown',
                isHost: myId === hostId,
                players: players
            });
        };

        socketService.on('v2_welcome', handleWelcome);
        socketService.on('v2_player_joined', handleNewPlayer);
        socketService.on('player_left', handlePlayerLeft);
        socketService.on('v2_host', handleHostChange);
        socketService.on('v2_start', handleStartGame);

        const joinInterval = setInterval(() => {
            if (!hasJoined.current) {
                console.log("📡 Tentativo invio v2_hello...");
                socketService.emit('v2_hello', { roomId: room.id, name: playerName });
            } else {
                clearInterval(joinInterval);
            }
        }, 1500);

        return () => {
            clearInterval(joinInterval);
            socketService.off('v2_welcome', handleWelcome);
            socketService.off('v2_player_joined', handleNewPlayer);
            socketService.off('player_left', handlePlayerLeft);
            socketService.off('v2_host', handleHostChange);
            socketService.off('v2_start', handleStartGame);
        };
    }, [room.id, playerName, onStartGame, myId, hostId, players]);

    const isMeHost = myId === hostId;
    const canStart = players.length >= 2;

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-white font-sans">
            <div className="max-w-md w-full bg-slate-900 border-2 border-indigo-500 rounded-3xl p-8 shadow-2xl space-y-6">
                <div className="text-center">
                    <h2 className="text-3xl font-black text-indigo-400 uppercase tracking-tighter italic">
                        Settore {room.id}
                    </h2>
                    <p className="text-slate-500 text-xs font-mono mt-1">Lobby di Sincronizzazione</p>
                </div>

                <div className="bg-slate-950/50 rounded-2xl p-4 border border-slate-800">
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                        <Users className="w-3 h-3" /> Membri Squadra ({players.length})
                    </h3>
                    
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                        {players.length === 0 ? (
                            <div className="flex items-center justify-center py-4 text-slate-600 gap-2">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span className="text-xs italic">Ricerca segnale...</span>
                            </div>
                        ) : (
                            players.map(p => (
                                <div key={p.id} className={`flex items-center justify-between p-3 rounded-xl border ${p.id === myId ? 'bg-indigo-500/10 border-indigo-500/50' : 'bg-slate-900 border-transparent'}`}>
                                    <div className="flex flex-col">
                                        <span className={`text-sm font-bold ${p.id === myId ? 'text-indigo-300' : 'text-slate-300'}`}>
                                            {p.name} {p.id === myId && "(TU)"}
                                        </span>
                                        <span className="text-[9px] text-slate-500 font-mono">{p.id.substring(0, 8)}...</span>
                                    </div>
                                    {p.id === hostId && <Crown className="w-4 h-4 text-yellow-500 shadow-sm" />}
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="pt-4 space-y-3">
                    {isMeHost ? (
                        <div className="space-y-2">
                            <button 
                                onClick={() => socketService.emit('v2_start', { roomId: room.id })}
                                disabled={!canStart}
                                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed text-white font-black rounded-xl transition-all flex items-center justify-center gap-2 uppercase tracking-widest shadow-lg shadow-indigo-500/20"
                            >
                                <Play className="w-5 h-5 fill-current" /> Avvia Missione
                            </button>
                            {!canStart && (
                                <p className="text-center text-[10px] text-orange-400 flex items-center justify-center gap-1 font-bold">
                                    <AlertTriangle className="w-3 h-3" /> Attendi almeno un altro giocatore
                                </p>
                            )}
                        </div>
                    ) : (
                        <div className="w-full py-4 bg-slate-800/50 rounded-xl text-center border border-slate-700/50">
                            <p className="text-xs font-bold text-slate-400 animate-pulse uppercase tracking-widest">
                                In attesa del leader...
                            </p>
                        </div>
                    )}

                    <button 
                        onClick={onLeave}
                        className="w-full py-3 text-slate-500 hover:text-rose-400 font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-colors"
                    >
                        <LogOut className="w-4 h-4" /> Abbandona
                    </button>
                </div>
            </div>
        </div>
    );
};

export default WaitingRoom;
