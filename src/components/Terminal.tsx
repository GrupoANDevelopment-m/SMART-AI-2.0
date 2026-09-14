import React, { useState, useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, ChevronRight } from 'lucide-react';

interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

export function Terminal({ className }: { className?: string }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    const newLog: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      message,
      type
    };
    setLogs(prev => [...prev.slice(-19), newLog]);
  };

  useEffect(() => {
    const handleAgentLog = (e: any) => {
      addLog(e.detail.message, e.detail.type || 'info');
    };
    window.addEventListener('agent-log', handleAgentLog);
    
    return () => {
      window.removeEventListener('agent-log', handleAgentLog);
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className={cn("bg-black/80 border border-zinc-800 rounded-2xl overflow-hidden font-mono text-[10px] flex flex-col", className || "h-64")}>
      <div className="bg-zinc-900/50 px-4 py-2 border-b border-zinc-800 flex items-center gap-2">
        <TerminalIcon className="w-3 h-3 text-emerald-400" />
        <span className="text-zinc-400 font-bold uppercase tracking-widest">Agent Terminal</span>
      </div>
      <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-1 scrollbar-hide">
        {logs.map(log => (
          <div key={log.id} className="flex gap-2">
            <span className="text-zinc-600">[{log.timestamp}]</span>
            <ChevronRight className="w-3 h-3 text-zinc-700 mt-0.5" />
            <span className={cn(
              "flex-1",
              log.type === 'success' ? "text-emerald-400" :
              log.type === 'warning' ? "text-amber-400" :
              log.type === 'error' ? "text-rose-400" : "text-zinc-300"
            )}>
              {log.message}
            </span>
          </div>
        ))}
        <div className="flex gap-2 animate-pulse">
          <span className="text-zinc-600">[{new Date().toLocaleTimeString()}]</span>
          <ChevronRight className="w-3 h-3 text-emerald-400 mt-0.5" />
          <span className="w-2 h-4 bg-emerald-500/50" />
        </div>
      </div>
    </div>
  );
}

// Helper to use cn in this file if needed, but better to import it
import { cn } from '../lib/utils';
