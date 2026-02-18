
import React, { useState, useMemo, useEffect } from 'react';
import { fetchAllFirebaseScores, fetchOnlineFirebaseScores, getPeriodBoundaries, formatPeriodLabel } from '../utils';
import { Trophy, Calendar, Clock, Award, History, ArrowLeftCircle, Bot, Globe, Loader2, Database, Info } from 'lucide-react';
import { ScoreEntry } from '../types';

const Leaderboard: React.FC = () => {
  const [tab, setTab] = useState<'allTime' | 'daily' | 'weekly' | 'monthly' | 'online'>('allTime');
  const [showHistory, setShowHistory] = useState(false);
  const [allScores, setAllScores] = useState<ScoreEntry[]>([]);
  const [onlineScores, setOnlineScores] = useState<ScoreEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Carica i dati
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const offline = await fetchAllFirebaseScores();
      setAllScores(offline);
      
      // Carica anche online se l'utente clicca il tab, o precarica ora
      const online = await fetchOnlineFirebaseScores();
      setOnlineScores(online);
      
      setLoading(false);
    };
    loadData();
  }, []);

  // Filtra i dati in memoria
  const filteredData = useMemo(() => {
    // Scegli dataset base
    const sourceData = tab === 'online' ? onlineScores : allScores;

    const filterTop = (scores: ScoreEntry[], start?: number, end?: number) => {
      return scores
        .filter(s => (!start || s.timestamp >= start) && (!end || s.timestamp <= end))
        .sort((a, b) => b.score - a.score)
        .slice(0, 50);
    };

    const db = getPeriodBoundaries('daily', 0);
    const dh = getPeriodBoundaries('daily', 1);
    const wb = getPeriodBoundaries('weekly', 0);
    const wh = getPeriodBoundaries('weekly', 1);
    const mb = getPeriodBoundaries('monthly', 0);
    const mh = getPeriodBoundaries('monthly', 1);

    return {
      allTime: filterTop(sourceData),
      daily: filterTop(sourceData, db.start, db.end),
      weekly: filterTop(sourceData, wb.start, wb.end),
      monthly: filterTop(sourceData, mb.start, mb.end),
      history: {
        daily: filterTop(sourceData, dh.start, dh.end),
        weekly: filterTop(sourceData, wh.start, wh.end),
        monthly: filterTop(sourceData, mh.start, mh.end),
      },
      labels: {
        daily: formatPeriodLabel('daily', 0),
        weekly: formatPeriodLabel('weekly', 0),
        monthly: formatPeriodLabel('monthly', 0),
        histDaily: formatPeriodLabel('daily', 1),
        histWeekly: formatPeriodLabel('weekly', 1),
        histMonthly: formatPeriodLabel('monthly', 1),
      }
    };
  }, [allScores, onlineScores, tab]);

  const getActiveList = () => {
    // Supportiamo filtri anche per online ora
    if (tab === 'allTime' || tab === 'online') return filteredData.allTime;
    return showHistory ? filteredData.history[tab] : filteredData[tab];
  };

  const getActiveLabel = () => {
    if (tab === 'allTime') return "RECORD TOTALI (GLOBAL - TOP 50)";
    if (tab === 'online') return "CLASSIFICA ONLINE (REAL-TIME PVP)";
    
    if (showHistory) {
      if (tab === 'daily') return `IERI (${filteredData.labels.histDaily})`;
      if (tab === 'weekly') return `SETTIMANA SCORSA (${filteredData.labels.histWeekly})`;
      if (tab === 'monthly') return `MESE SCORSO (${filteredData.labels.histMonthly})`;
    } else {
      if (tab === 'daily') return `OGGI (${filteredData.labels.daily})`;
      if (tab === 'weekly') return `QUESTA SETTIMANA (${filteredData.labels.weekly})`;
      if (tab === 'monthly') return `QUESTO MESE (${filteredData.labels.monthly})`;
    }
    return "";
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const activeList = getActiveList();

  return (
    <div className="bg-slate-900/95 backdrop-blur-2xl border-2 border-slate-800 rounded-[2.5rem] p-6 space-y-6 w-full max-w-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] animate-in zoom-in duration-300 overflow-hidden flex flex-col h-[600px]">
      {/* Header & Main Tabs */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-black uppercase tracking-tighter flex items-center gap-3">
            <Award className="text-cyan-400 w-6 h-6" /> Hall of Fame
          </h3>
          <div className="flex gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            {(['allTime', 'daily', 'weekly', 'monthly'] as const).map(t => (
              <button 
                key={t} onClick={() => { setTab(t); setShowHistory(false); }}
                className={`px-3 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${tab === t ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/50' : 'text-slate-500 hover:text-slate-300'}`}
              >
                {t === 'allTime' ? 'Total' : t.charAt(0)}
              </button>
            ))}
            <button 
              onClick={() => { setTab('online'); setShowHistory(false); }}
              className={`px-3 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all flex items-center gap-1 ${tab === 'online' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <Globe className="w-3 h-3" /> Online
            </button>
          </div>
        </div>

        {/* Info Label */}
        <div className="flex items-center justify-between bg-slate-950/50 p-3 rounded-xl border border-slate-800/50">
          <span className="text-[10px] font-black uppercase text-slate-300 tracking-widest flex items-center gap-2 italic">
            <Database className="w-3 h-3 text-cyan-400" /> 
            {getActiveLabel()}
          </span>
          {tab !== 'allTime' && (
            <button 
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-2 text-[10px] font-black uppercase text-cyan-400 hover:text-cyan-300 transition-colors bg-cyan-400/10 px-3 py-1 rounded-lg border border-cyan-400/20"
            >
              {showHistory ? <ArrowLeftCircle className="w-3 h-3" /> : <History className="w-3 h-3" />}
              {showHistory ? 'Correnti' : 'Archivio'}
            </button>
          )}
        </div>
      </div>
      
      {/* Table Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-cyan-400 space-y-4">
            <Loader2 className="w-12 h-12 animate-spin opacity-50" />
            <span className="text-xs uppercase font-black tracking-widest block">Retrieving Data...</span>
          </div>
        ) : activeList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-600 space-y-2">
            <Clock className="w-8 h-8 opacity-20" />
            <span className="text-xs uppercase font-black tracking-widest">Nessun record trovato</span>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 pr-2 custom-scrollbar">
            <table className="w-full text-left border-separate border-spacing-y-2">
              <thead className="sticky top-0 bg-slate-900 z-10">
                <tr className="text-[9px] font-black uppercase text-slate-500 tracking-[0.2em]">
                  <th className="px-4 py-2">Rank</th>
                  <th className="px-4 py-2">Survivor</th>
                  <th className="px-4 py-2">Tempo</th>
                  <th className="px-4 py-2 text-center">{tab === 'online' ? 'Players' : 'Bots'}</th>
                  <th className="px-4 py-2 text-right">Data</th>
                </tr>
              </thead>
              <tbody>
                {activeList.map((s, i) => (
                  <tr key={`${s.playerName}-${s.timestamp}-${i}`} className="group bg-slate-950/40 border border-slate-800/50 hover:bg-slate-900/60 transition-all">
                    <td className="px-4 py-3 rounded-l-xl">
                      <div className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-black shadow-sm ${i === 0 ? 'bg-yellow-500 text-slate-950' : i === 1 ? 'bg-slate-300 text-slate-950' : i === 2 ? 'bg-orange-600 text-slate-950' : 'bg-slate-800 text-slate-500'}`}>
                        {i + 1}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-200 group-hover:text-cyan-400 transition-colors truncate max-w-[120px]">{s.playerName}</span>
                        {tab === 'online' && s.roomId && <span className="text-[8px] text-indigo-400 uppercase">Sector: {s.roomId.substring(0,6)}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono font-black text-white italic">
                      {formatTime(s.score)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border ${tab === 'online' ? 'bg-indigo-900/40 border-indigo-800' : 'bg-slate-900 border-slate-800'}`}>
                        {tab === 'online' ? <Globe className="w-3 h-3 text-indigo-400" /> : <Bot className="w-3 h-3 text-rose-500" />}
                        <span className="text-[10px] font-bold text-slate-400">{tab === 'online' ? s.playerCount : s.botCount}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right rounded-r-xl">
                      <span className="text-[10px] text-slate-600 font-black uppercase">
                        {s.timestamp > 0 ? new Date(s.timestamp).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) : 'N/A'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="pt-4 border-t border-slate-800/50 flex justify-between items-center text-[9px] text-slate-600 font-black uppercase tracking-[0.2em]">
        <span>SYNCED: {activeList.length} RECORDS</span>
        <span>VERSION 2.2.3</span>
      </div>
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(15, 23, 42, 0.1); }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #475569; }
      `}</style>
    </div>
  );
};

export default Leaderboard;
