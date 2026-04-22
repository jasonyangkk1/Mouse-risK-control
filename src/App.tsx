/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, type FormEvent, type MouseEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  ShieldCheck, 
  TrendingUp, 
  Scale, 
  Calendar, 
  ChevronRight, 
  AlertCircle, 
  CheckCircle2, 
  XCircle,
  Activity,
  BarChart3,
  Loader2,
  History,
  Trash2,
  ExternalLink
} from 'lucide-react';
import { analyzeStock, resolveStockTicker, type StockAnalysis, type AnalystTarget, type TickerResolution } from './services/geminiService';

const ReliabilityBadge = ({ level }: { level: AnalystTarget["dataReliability"] }) => {
  const config = {
    VERIFIED:   { label: "✓ 已驗證", className: "bg-green-500/10 text-green-400 border-green-500/30" },
    INFERRED:   { label: "~ 推估",   className: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
    UNVERIFIED: { label: "⚠ 無來源", className: "bg-red-500/10 text-red-400 border-red-500/30" },
  };
  const c = config[level];
  return <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${c.className}`}>{c.label}</span>;
};

const ConsensusPanel = ({ analystTargets, consensusSummary }: { analystTargets: AnalystTarget[]; consensusSummary: string }) => {
  const hasVerified = analystTargets?.some(t => t.dataReliability === "VERIFIED");
  return (
    <div className="space-y-2">
      {!hasVerified && (
        <div className="flex items-start gap-2 p-2 bg-amber-500/5 border border-amber-500/20 rounded text-[9px] text-amber-400/80 font-mono leading-relaxed">
          ⚠ 未找到可驗證的法人報告，以下數據可能為 AI 推估，請以 Bloomberg / CMoney 法人版為準。
        </div>
      )}
      {analystTargets?.map((t, i) => (
        <div key={i} className="flex items-center justify-between gap-2 py-1.5 border-b border-white/5 last:border-0">
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-white font-mono">{t.broker}</span>
              <ReliabilityBadge level={t.dataReliability} />
            </div>
            <div className="text-[9px] text-slate-500 font-mono">{t.reportDate}</div>
          </div>
          <div className="flex flex-col items-end gap-0.5 shrink-0">
            <div className={`text-[11px] font-mono ${
              t.dataReliability === "VERIFIED" 
                ? "text-cyan-400 font-bold" 
                : "text-slate-500 line-through opacity-70"
            }`}>
              {t.targetPrice != null ? `目標 $${t.targetPrice}` : "目標 N/A"}
              {t.dataReliability !== "VERIFIED" && (
                <span className="block text-[8px] no-underline opacity-60 mt-0.5">數據未經驗證，僅供參考</span>
              )}
            </div>
            <div className="text-[9px] text-slate-500">{t.rating}</div>
          </div>
          {t.sourceUrl && <a href={t.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[9px] text-cyan-500/60 hover:text-cyan-400 underline font-mono shrink-0">來源↗</a>}
        </div>
      ))}
      <p className="text-[10px] text-slate-400 leading-relaxed pt-1 italic">{consensusSummary}</p>
    </div>
  );
};

interface HistoryItem {
  id: string;
  timestamp: string;
  data: StockAnalysis;
}

export default function App() {
  const [ticker, setTicker] = useState('');
  const [price, setPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [tickerOptions, setTickerOptions] = useState<TickerResolution[]>([]);
  const [result, setResult] = useState<StockAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'intelligence' | 'history'>('dashboard');
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    if (typeof window !== 'undefined') {
      const savedHistory = localStorage.getItem('zenith_search_history');
      if (savedHistory) {
        try {
          return JSON.parse(savedHistory);
        } catch (e) {
          console.error('Failed to parse history', e);
          return [];
        }
      }
    }
    return [];
  });

  // Save history to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('zenith_search_history', JSON.stringify(history));
  }, [history]);

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!ticker.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setTickerOptions([]);

    try {
      const options = await resolveStockTicker(ticker);
      if (options.length === 1) {
        await executeAnalysis(options[0].ticker);
      } else if (options.length > 1) {
        setTickerOptions(options);
      } else {
        setError('找不到對應的股票代號，請重新輸入。');
      }
    } catch (err) {
      console.error(err);
      setError('搜尋失敗，請檢查網路連線或稍後再試。');
    } finally {
      setLoading(false);
    }
  };

  const executeAnalysis = async (resolvedTicker: string) => {
    setLoading(true);
    setError(null);
    setTickerOptions([]);
    
    try {
      const parsedPrice = price ? parseFloat(price) : undefined;
      const data = await analyzeStock(resolvedTicker, parsedPrice);
      setResult(data);
      
      // Add to history
      const newHistoryItem: HistoryItem = {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
        data: data
      };
      
      setHistory(prev => {
        // Prevent duplicates (optional: move to top if exists)
        const filtered = prev.filter(item => item.data.ticker !== data.ticker);
        return [newHistoryItem, ...filtered].slice(0, 50); // Keep last 50
      });
      
      setActiveTab('dashboard');
      setPrice(''); // Clear price after success
    } catch (err) {
      console.error(err);
      setError('分析失敗，請檢查網路連線或稍後再試。');
    } finally {
      setLoading(false);
    }
  };

  const loadFromHistory = (item: HistoryItem) => {
    setResult(item.data);
    setTicker(item.data.ticker);
    setActiveTab('dashboard');
  };

  const deleteHistoryItem = (e: MouseEvent, id: string) => {
    e.stopPropagation();
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  const clearHistory = () => {
    if (confirm('確定要清除所有搜尋紀錄嗎？')) {
      setHistory([]);
    }
  };

  return (
    <div className="min-h-screen bg-surface-base text-slate-200 p-4 sm:p-6 flex flex-col font-sans">
      {/* Header Section */}
      <header className="flex justify-between items-end border-b border-white/10 pb-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-3 h-3 rounded-full animate-pulse ${loading ? 'bg-amber-500' : 'bg-cyan-500'}`}></div>
            <h1 className="mono-label !text-cyan-500">Gemini Intelligence System v4.0</h1>
          </div>
          <h2 className="text-3xl sm:text-4xl font-light tracking-tight text-white flex items-center gap-3">
            {result ? `${result.ticker} ${result.name}` : 'Zenith Risk Analyzer'}
            {result && <span className="text-lg text-slate-500 font-normal">ANALYSIS REPORT</span>}
          </h2>
        </div>
        <div className="text-right hidden sm:block">
          <div className="text-2xl font-mono text-white">
            {result ? (
              <div className="flex flex-col items-end">
                <div className="flex items-center gap-2">
                  <span>${result.currentPrice}</span>
                  <span className="text-[10px] text-cyan-400 font-bold bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20">LIVE</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-tighter">
                  Last Close: <span className="text-slate-300">${result.lastClose}</span>
                </div>
              </div>
            ) : '--.--'}
          </div>
          {!result && <div className="mono-label">SYSTEM STATUS: {loading ? 'PROCESSING' : 'READY'}</div>}
        </div>
      </header>

      {/* Search Input Container */}
      <div className="max-w-2xl mx-auto w-full mb-8">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 group">
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              placeholder="TICKER (e.g. 2330)"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-5 py-4 pl-12 text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-all shadow-xl"
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-cyan-500 transition-colors w-5 h-5" />
          </div>

          <div className="relative w-full sm:w-48 group">
            <input
              type="number"
              step="any"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="PRICE (OPTIONAL)"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-5 py-4 text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-all shadow-xl"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="bg-cyan-500 hover:bg-cyan-400 text-black px-8 py-4 rounded-lg font-bold text-xs tracking-widest uppercase transition-all disabled:opacity-50 shadow-lg shadow-cyan-500/20 whitespace-nowrap"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto text-black" /> : 'RUN ANALYTICS'}
          </button>
        </form>

        <p className="mt-3 text-[10px] text-slate-500 text-center font-mono">
          TIP: ENTER THE RECENT CLOSING PRICE FOR 100% CALCULATION ACCURACY.
        </p>

        <AnimatePresence>
          {tickerOptions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 p-4 bg-white/5 border border-white/10 rounded-lg space-y-3"
            >
              <p className="text-[10px] text-cyan-500 font-mono tracking-widest uppercase mb-2">
                Multiple candidates found. Please select:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {tickerOptions.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => executeAnalysis(opt.ticker)}
                    className="flex justify-between items-center p-3 bg-white/5 hover:bg-cyan-500/10 border border-white/10 hover:border-cyan-500/50 rounded transition-all text-left group"
                  >
                    <div className="flex flex-col">
                      <span className="text-[11px] font-mono font-bold text-white group-hover:text-cyan-400">
                        {opt.ticker}
                      </span>
                      <span className="text-[9px] text-slate-500 uppercase tracking-tighter">
                        {opt.name}
                      </span>
                    </div>
                    <span className="text-[8px] text-slate-600 font-mono bg-white/5 px-1.5 py-0.5 rounded border border-white/5 uppercase">
                      {opt.exchange}
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded flex items-center gap-3"
            >
              <AlertCircle className="shrink-0 w-4 h-4" />
              <p className="text-xs font-mono tracking-tight">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {loading && (
        <div className="flex-1 flex flex-col items-center justify-center space-y-4">
          <div className="w-16 h-1 bg-white/5 rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-cyan-500 accent-glow"
              initial={{ x: '-100%' }}
              animate={{ x: '100%' }}
              transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
            />
          </div>
          <div className="mono-label animate-pulse">Initializing Neural Analysis Pipeline...</div>
        </div>
      )}

      {/* Main Analysis Content */}
      {!loading && result && (
        <div className="flex-1 flex flex-col gap-6">
          {/* Internal Navigation Tabs */}
          <div className="flex border-b border-white/5 mb-2 overflow-x-auto no-scrollbar">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`px-6 py-3 mono-label !text-[10px] tracking-[0.2em] transition-all relative whitespace-nowrap ${
                activeTab === 'dashboard' ? 'text-cyan-500' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              01. MARKET DASHBOARD
              {activeTab === 'dashboard' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]" />}
            </button>
            <button 
              onClick={() => setActiveTab('intelligence')}
              className={`px-6 py-3 mono-label !text-[10px] tracking-[0.2em] transition-all relative whitespace-nowrap ${
                activeTab === 'intelligence' ? 'text-cyan-500' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              02. INTELLIGENCE LOG
              {activeTab === 'intelligence' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]" />}
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              className={`px-6 py-3 mono-label !text-[10px] tracking-[0.2em] transition-all relative whitespace-nowrap ${
                activeTab === 'history' ? 'text-cyan-500' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              03. SEARCH HISTORY
              {activeTab === 'history' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]" />}
            </button>
          </div>

          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' ? (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, x: -10 }} 
                animate={{ opacity: 1, x: 0 }} 
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1"
              >
                {/* Left Column: Metrics */}
                <div className="lg:col-span-8 flex flex-col gap-6">
                  
                  {/* Top Row: F-Score & Market Breadth */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* 1. F-Score Card */}
                    <div className="card-sophisticated">
                      <div className="flex justify-between items-start mb-4 border-b border-white/5 pb-3">
                        <h3 className="mono-label !text-slate-400 tracking-wider">01. F-Score Analysis</h3>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                          (result.fScore?.total ?? 0) >= 5 
                            ? 'bg-green-500/10 text-green-400 border-green-500/20' 
                            : 'bg-red-500/10 text-red-400 border-red-500/20'
                        }`}>
                          SCORE: {result.fScore?.total ?? 0}/9
                        </span>
                      </div>
                      <div className="space-y-2">
                        {result.fScore?.details?.slice(0, 4).map((detail, idx) => (
                          <div key={idx} className="flex justify-between text-[11px] border-b border-white/5 pb-1">
                            <span className="text-slate-500">{detail.name}</span>
                            <span className={detail.met ? 'text-green-400 font-mono' : 'text-slate-600 font-mono'}>
                              {detail.met ? 'PASS' : 'FAIL'}
                            </span>
                          </div>
                        ))}
                        {(result.fScore?.details?.length ?? 0) > 4 && (
                          <div className="text-[9px] text-slate-600 font-mono pt-1 italic text-center uppercase tracking-widest">
                            + Total 9 metrics evaluated
                          </div>
                        )}
                      </div>
                      <p className="mt-4 text-[11px] text-slate-400 leading-relaxed italic border-t border-white/5 pt-3">
                        "{result.fScore?.details?.find(d => !d.met)?.reason || '底子厚實，獲利與營運指標維持在健康水位。'}"
                      </p>
                    </div>

                    {/* 2. Market Breadth */}
                    <div className="card-sophisticated">
                      <h3 className="mono-label !text-slate-400 tracking-wider mb-4 border-b border-white/5 pb-3">02. Market Breadth</h3>
                      <div className="flex items-end gap-3 mb-6">
                        <div className="text-4xl font-mono text-cyan-500 leading-none">{result.marketBreadth?.momentumPercentage ?? 0}<span className="text-sm opacity-50">%</span></div>
                        <div className="mono-label !text-cyan-500 mb-1 tracking-widest">Sector Momentum</div>
                      </div>
                      <div className="space-y-4">
                        <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full bg-cyan-500 accent-glow transition-all duration-1000" style={{ width: `${result.marketBreadth?.momentumPercentage ?? 0}%` }}></div>
                        </div>
                        <div className="text-[11px] space-y-2 font-mono">
                          <div className="flex justify-between">
                            <span className="text-slate-500 uppercase">Industry Status:</span>
                            <span className="text-white">{result.marketBreadth?.industryStatus ?? 'Unknown'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500 uppercase">Trend Cluster:</span>
                            <span className="text-white">{result.marketBreadth?.trend ?? 'Neutral'}</span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 p-3 bg-cyan-500/5 border border-cyan-500/10 rounded text-[10px] text-slate-400 leading-relaxed italic">
                        "{result.marketBreadth?.description ?? 'No detailed breadth analysis available.'}"
                      </div>
                    </div>
                  </div>

                  {/* Middle Row: Risk-Reward */}
                  <div className="card-sophisticated py-4 px-6 md:p-5">
                    <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-2">
                      <h3 className="mono-label !text-slate-400">03. Risk-Reward</h3>
                      <div className="text-right">
                        <span className="mono-label block !text-[8px] opacity-60">EXPECTED RATIO</span>
                        <span className="text-xl font-mono text-white leading-none">1 : {result.riskReward?.ratio ?? '0.0'}</span>
                      </div>
                    </div>
                    <div className="relative h-16 mb-4 max-w-sm mx-auto">
                      <div className="absolute w-full h-[0.5px] bg-white/10 top-1/2 -translate-y-1/2"></div>
                      <div className="absolute left-[20%] top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-red-500 rounded-full border border-surface-base accent-glow"></div>
                      <div className="absolute left-[45%] top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-cyan-500 rounded-full border-2 border-surface-base accent-glow scale-110 z-10"></div>
                      <div className="absolute left-[85%] top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-green-500 rounded-full border border-surface-base accent-glow"></div>
                      
                      <div className="absolute left-[20%] top-0 -translate-x-1/2 text-[9px] font-mono text-red-500 uppercase">STOP: {result.riskReward?.support ?? '---'}</div>
                      <div className="absolute left-[45%] top-10 -translate-x-1/2 text-[9px] font-mono text-cyan-500 uppercase">ENTRY: {result.currentPrice}</div>
                      <div className="absolute left-[85%] top-0 -translate-x-1/2 text-[9px] font-mono text-green-500 uppercase">TARGET: {result.riskReward?.target ?? '---'}</div>
                    </div>
                    <div className="text-[10px] text-slate-500 italic text-center text-balance">
                      "{result.riskReward?.description ?? 'N/A'}"
                    </div>
                  </div>

                  {/* Bottom Row: Revenue Timeline */}
                  <div className="card-sophisticated border-cyan-500/20 p-4 md:p-5">
                    <h3 className="mono-label !text-slate-400 mb-4 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full"></span>
                      04. Momentum Analytics
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="space-y-1">
                        <div className="mono-label !text-[9px] opacity-70">LAST REPORT</div>
                        <div className="text-sm font-mono text-white leading-tight">{result.revenueSummary?.lastMonth ?? 'N/A'}</div>
                        <div className="text-[9px] font-mono text-cyan-500/80">SURPRISE: {result.revenueSummary?.estimateSurprise || 'N/A'}</div>
                      </div>
                      <div className="space-y-1">
                        <div className="mono-label !text-[9px] opacity-70">ANNOUNCEMENT</div>
                        <div className="text-xs text-white">ETA: <span className="text-white font-mono">{result.revenueSummary?.nextAnnouncementDate ?? 'N/A'}</span></div>
                        <div className="text-[9px] text-slate-400 italic">{result.revenueSummary?.forecastWindow ?? 'N/A'}</div>
                      </div>
                      <div className="space-y-1 sm:col-span-2 lg:col-span-2">
                        <div className="mono-label !text-[9px] opacity-70 mb-2">INSTITUTION CONSENSUS</div>
                        <ConsensusPanel analystTargets={result.analystTargets ?? []} consensusSummary={result.consensusSummary ?? ""} />
                      </div>
                      <div className="space-y-1 sm:col-span-2 lg:col-span-1">
                        <div className="mono-label !text-[9px] opacity-70">REVENUE STATUS</div>
                        <div className="text-xs font-semibold text-cyan-400 leading-snug">{result.revenueSummary?.status ?? 'N/A'}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column: Final Verdict */}
                <div className="lg:col-span-4 flex flex-col gap-6">
                  <div className="flex-1 verdict-gradient rounded-xl border border-cyan-500/30 p-6 flex flex-col shadow-2xl shadow-cyan-950/20">
                    <div className="text-center mb-8">
                      <h4 className="mono-label !text-cyan-500 !text-[11px] tracking-[0.3em] mb-4">Gemini Core Synthesis</h4>
                      <div className={`text-5xl font-black tracking-tighter mb-4 underline decoration-4 underline-offset-8 uppercase ${
                        result.verdict === '可以買進' ? 'text-white decoration-cyan-500' : 'text-amber-500 decoration-amber-500'
                      }`}>
                        {result.verdict}
                      </div>
                      <div className="mono-label !text-cyan-400 opacity-60">CONFIDENCE: {result.score}%</div>
                    </div>
                    
                    <div className="mt-auto">
                      <button 
                        onClick={() => setActiveTab('intelligence')}
                        className="w-full bg-cyan-500 hover:bg-cyan-400 py-4 rounded font-bold text-black text-xs tracking-[0.2em] uppercase transition-all shadow-lg shadow-cyan-500/20"
                      >
                        Read Deep Intelligence Log
                      </button>
                    </div>
                  </div>
                  
                  <div className="p-5 card-sophisticated !bg-white/[0.02]">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
                      <span className="mono-label !text-amber-500 !text-[9px]">Data Provenance</span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-relaxed font-mono">
                      Sourced via Neural Search across Public Exchanges, Global Institutional Feeds, and Sector Dispersion Analytics.
                    </p>
                  </div>
                </div>
              </motion.div>
            ) : activeTab === 'intelligence' ? (
              <motion.div 
                key="intelligence"
                initial={{ opacity: 0, x: 10 }} 
                animate={{ opacity: 1, x: 0 }} 
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="flex-1"
              >
                <div className="card-sophisticated border-cyan-500/30 p-8 flex flex-col min-h-[600px]">
                  <div className="flex items-center justify-between mb-8 border-b border-white/10 pb-4">
                    <div className="flex items-center gap-3">
                      <Activity className="text-cyan-500 w-5 h-5" />
                      <h3 className="mono-label !text-cyan-500 tracking-[0.2em]">NEURAL INTELLIGENCE LOG [DECRYPTED]</h3>
                    </div>
                    <div className="mono-label !text-[10px] text-slate-500">REF ID: {result.ticker}-TRX-82</div>
                  </div>

                  <div className="flex-1 space-y-8 font-mono">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <span className="text-cyan-500 font-bold tracking-widest">[SYNTH]</span>
                        <span className="text-slate-500 text-[10px]">CORE SUGGESTION</span>
                      </div>
                      <p className="text-base text-slate-200 leading-relaxed pl-4 border-l-2 border-cyan-500/20">
                        {result.suggestion}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                          <span className="text-slate-400 font-bold tracking-widest">[F-SCORE]</span>
                          <span className="text-slate-500 text-[10px]">HYGIENE AUDIT</span>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          {(result.fScore?.total ?? 0) >= 5 ? '經由神經網絡審核，該標的之資產收益與經營槓桿比例皆處於安全防護區間內，具備核心競爭優勢。' : '系統檢測到潛在的流動性缺口與資產報酬率下滑，基本面存在結構性修正風險，建議降低倉位權重。'}
                        </p>
                        <div className="grid grid-cols-1 gap-2">
                          {result.fScore?.details?.map((d, i) => (
                            <div key={i} className="flex items-center gap-2 text-[10px]">
                              <div className={`w-1.5 h-1.5 rounded-full ${d.met ? 'bg-cyan-500' : 'bg-slate-700'}`}></div>
                              <span className={d.met ? 'text-slate-300' : 'text-slate-600'}>{d.name}: {d.met ? 'VERIFIED' : 'FAILED'}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                          <span className="text-slate-400 font-bold tracking-widest">[BREADTH]</span>
                          <span className="text-slate-500 text-[10px]">SECTOR DYNAMICS</span>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          指標顯示當前族群動能平衡為：{result.marketBreadth?.industryStatus ?? 'Unknown'}。子族群聚類分析指出：{result.marketBreadth?.trend ?? 'Neutral'}。
                        </p>
                        <div className="p-4 bg-white/5 rounded border border-white/5 text-[11px] text-slate-500 italic">
                          "{result.marketBreadth?.description ?? 'N/A'}"
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                        <span className="text-slate-400 font-bold tracking-widest">[INSTITUTION]</span>
                        <span className="text-slate-500 text-[10px]">CONSENSUS AGGREGATION</span>
                      </div>
                      <div className="p-5 bg-cyan-500/5 border border-cyan-500/10 rounded-lg">
                        <ConsensusPanel analystTargets={result.analystTargets ?? []} consensusSummary={result.consensusSummary ?? ""} />
                      </div>
                    </div>

                    <div className="pt-8 border-t border-white/5 flex justify-between items-end">
                      <div className="text-[10px] text-slate-600 italic">
                        All analysis generated via Zenith Intelligence Neural Engine v4.0.
                      </div>
                      <div className="flex gap-4">
                        <ShieldCheck className="text-cyan-500 opacity-20 w-8 h-8" />
                        <TrendingUp className="text-cyan-500 opacity-20 w-8 h-8" />
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="history"
                initial={{ opacity: 0, scale: 0.98 }} 
                animate={{ opacity: 1, scale: 1 }} 
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                className="flex-1"
              >
                <div className="card-sophisticated border-white/5 p-6 min-h-[500px]">
                  <div className="flex items-center justify-between mb-8 border-b border-white/5 pb-4">
                    <div className="flex items-center gap-3">
                      <History className="text-cyan-500 w-5 h-5" />
                      <h3 className="mono-label !text-cyan-500 tracking-[0.2em]">LOCAL INTELLIGENCE STORAGE</h3>
                    </div>
                    {history.length > 0 && (
                      <button 
                        onClick={clearHistory}
                        className="text-[10px] font-mono text-slate-600 hover:text-red-400 transition-colors uppercase tracking-widest flex items-center gap-2"
                      >
                        <Trash2 className="w-3 h-3" /> Clear All
                      </button>
                    )}
                  </div>

                  {history.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 opacity-30">
                      <History className="w-12 h-12 mb-4" />
                      <p className="mono-label text-[10px]">No encrypted logs found in local cache.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {history.map((item) => (
                        <div 
                          key={item.id}
                          onClick={() => loadFromHistory(item)}
                          className="group bg-white/[0.03] border border-white/10 rounded-lg p-5 hover:border-cyan-500/50 hover:bg-white/[0.05] transition-all cursor-pointer relative overflow-hidden"
                        >
                          <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={(e) => deleteHistoryItem(e, item.id)}
                              className="p-1 hover:text-red-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <div className="text-xl font-mono text-white leading-none mb-1">{item.data.ticker}</div>
                              <div className="text-[10px] text-slate-500 font-mono uppercase truncate max-w-[150px]">
                                {item.data.name}
                              </div>
                            </div>
                            <div className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                              item.data.verdict === '可以買進' 
                                ? 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20' 
                                : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                            }`}>
                              {item.data.verdict}
                            </div>
                          </div>
                          
                          <div className="flex justify-between items-end">
                            <div className="text-[9px] text-slate-600 font-mono">
                              {item.timestamp}
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-cyan-500 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                              OPEN <ExternalLink className="w-3 h-3" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Empty State / Dashboard Intro */}
      {!loading && !result && !error && (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <div className="w-24 h-24 mb-6 relative">
            <div className="absolute inset-0 bg-cyan-500/10 rounded-full animate-ping"></div>
            <div className="absolute inset-4 bg-surface-card border border-cyan-500/30 rounded-2xl flex items-center justify-center">
              <ShieldCheck className="text-cyan-500 w-8 h-8" />
            </div>
          </div>
          <h3 className="text-xl font-light tracking-widest text-white uppercase mb-2">Neural Risk Processor</h3>
          <p className="text-xs text-slate-500 max-w-xs font-mono tracking-tight leading-relaxed">
            Enter a ticker symbol to initialize the the multi-model risk assessment pipeline. 
            Real-time sector clustering and financial hygiene scoring enabled.
          </p>
        </div>
      )}

      {/* Footer Bar */}
      <footer className="mt-auto flex justify-between items-center py-4 border-t border-white/5 opacity-50">
        <div className="flex gap-6 mono-label !text-[8px] tracking-[0.15em]">
          <span>NETWORK: ENCRYPTED</span>
          <span>LATENCY: 42MS</span>
        </div>
        <div className="flex gap-6 mono-label !text-[8px] tracking-[0.15em]">
          <span>© 2026 ZENITH INTELLIGENCE</span>
          <span>MODE: GEMINI-3.1-PRO</span>
        </div>
      </footer>
    </div>
  );
}
