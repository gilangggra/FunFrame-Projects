'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Video, Users, Zap, Globe, ArrowRight, Loader2 } from 'lucide-react';
import { useParty } from './hooks/useParty';

const FEATURES = [
  { icon: Users, label: 'Party bareng teman' },
  { icon: Zap, label: 'Match dalam detik' },
  { icon: Globe, label: 'Terhubung ke dunia' },
  { icon: Video, label: 'Video call HD' },
];

export default function Home() {
  const router = useRouter();
  const { state, createParty, joinParty } = useParty();
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (state.status === 'lobby' && state.code) {
      localStorage.setItem('participantName', name.trim());
      router.push(`/party/${state.code}`);
    }
  }, [state.status, state.code]);

  useEffect(() => {
    if (state.error) setLoading(false);
  }, [state.error]);

  const handleCreate = () => {
    if (!name.trim()) return alert('Masukkan nama kamu dulu');
    setLoading(true);
    createParty(name.trim());
  };

  const handleJoin = () => {
    if (!name.trim()) return alert('Masukkan nama kamu dulu');
    if (!joinCode.trim()) return alert('Masukkan kode party dulu');
    setLoading(true);
    joinParty(joinCode.trim().toUpperCase(), name.trim());
  };

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 relative overflow-hidden">

      <div className="w-full max-w-md relative z-10 space-y-8">

        {/* Hero */}
        <motion.div
          className="text-center space-y-4"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="inline-flex items-center gap-2 bg-white border border-gray-200 shadow-sm rounded-full px-4 py-1.5 text-gray-600 text-sm mb-2 font-medium">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            Online & Ready
          </div>
          <h1 className="text-6xl font-extrabold text-gray-900 tracking-tight leading-none">
            Fun<span className="text-indigo-600">Frame</span>
          </h1>
          <p className="text-gray-500 text-lg">
            Bikin party, match random, video call seru!
          </p>
        </motion.div>

        {/* Feature pills */}
        <motion.div
          className="flex flex-wrap justify-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {FEATURES.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-1.5 bg-white border border-gray-200 shadow-sm rounded-full px-3 py-1.5 text-gray-600 text-xs font-medium"
            >
              <Icon size={12} className="text-indigo-500" />
              {label}
            </div>
          ))}
        </motion.div>

        {/* Card */}
        <motion.div
          className="bg-white rounded-3xl p-6 border border-gray-100 space-y-5 shadow-xl shadow-gray-200/50"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >

          {/* Nama Input */}
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-widest mb-2 block font-semibold">
              Nama kamu
            </label>
            <input
              type="text"
              placeholder="Masukkan nama..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (mode === 'create' ? handleCreate() : handleJoin())}
              className="w-full bg-gray-50 text-gray-900 rounded-2xl px-4 py-3.5 outline-none focus:ring-2 focus:ring-indigo-500/50 placeholder-gray-400 transition border border-gray-200 focus:border-indigo-500/50 shadow-inner"
            />
          </div>

          {/* Mode Toggle */}
          <div className="flex bg-gray-50 rounded-2xl p-1 border border-gray-100">
            {(['create', 'join'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${mode === m
                    ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                    : 'text-gray-500 hover:text-gray-700'
                  }`}
              >
                {m === 'create' ? '🎉 Buat Party' : '🔗 Gabung Party'}
              </button>
            ))}
          </div>

          {/* Animated panel */}
          <AnimatePresence mode="wait">
            {mode === 'create' ? (
              <motion.div
                key="create"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
              >
                <button
                  onClick={handleCreate}
                  disabled={loading}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 text-lg shadow-lg shadow-indigo-600/20"
                >
                  {loading ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    <>Buat Party Baru <ArrowRight size={18} /></>
                  )}
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="join"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-3"
              >
                <input
                  type="text"
                  placeholder="KODE PARTY"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                  maxLength={6}
                  className="w-full bg-gray-50 text-gray-900 rounded-2xl px-4 py-3.5 outline-none focus:ring-2 focus:ring-teal-500/50 placeholder-gray-400 font-mono tracking-[0.3em] text-center text-xl border border-gray-200 focus:border-teal-500/50 transition shadow-inner"
                />
                <button
                  onClick={handleJoin}
                  disabled={loading}
                  className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 text-lg shadow-lg shadow-teal-600/20"
                >
                  {loading ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    <>Gabung Sekarang <ArrowRight size={18} /></>
                  )}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error */}
          <AnimatePresence>
            {state.error && (
              <motion.p
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-red-600 text-sm text-center bg-red-50 border border-red-100 rounded-xl py-2.5 px-4 font-medium"
              >
                ⚠️ {state.error}
              </motion.p>
            )}
          </AnimatePresence>

        </motion.div>

        <p className="text-center text-gray-400 text-xs">
          © 2025 FunFrame · Dengan bergabung kamu setuju dengan syarat & ketentuan
        </p>

      </div>
    </main>
  );
}