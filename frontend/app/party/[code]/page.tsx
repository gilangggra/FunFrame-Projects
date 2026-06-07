'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useParty } from '../../hooks/useParty';
import { useSound } from '../../hooks/useSound';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, LogOut, Crown, User, Search, X, Users, Radar, Gamepad2 } from 'lucide-react';
import { LiveKitRoom, TrackToggle, GridLayout, ParticipantTile, RoomAudioRenderer, useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import '@livekit/components-styles';
import SkribblBoard from '../../components/SkribblBoard';

// Komponen grid manual untuk menghindari bug 'Element not part of the array' dari LiveKit
function SimpleGrid({ tracks }: { tracks: any[] }) {
    if (tracks.length === 0) return null;
    
    let gridCols = "grid-cols-1";
    let gridRows = "grid-rows-1";
    if (tracks.length === 2) {
        gridCols = "grid-cols-1 md:grid-cols-2"; // 1x2
    } else if (tracks.length >= 3) {
        gridCols = "grid-cols-2";
        gridRows = "grid-rows-2"; // 2x2
    }

    return (
        <div className={`grid ${gridCols} ${gridRows} gap-4 p-4 w-full h-full place-items-stretch`}>
            {tracks.map((t) => (
                <div key={t.participant.identity + t.source} className="relative w-full h-full min-h-[150px] bg-gray-900/50 rounded-[1.5rem] overflow-hidden border border-gray-700/50 shadow-lg">
                    <ParticipantTile 
                        trackRef={t} 
                        className="absolute inset-0 w-full h-full" 
                    />
                </div>
            ))}
        </div>
    );
}

function MyVideoGrid({ partyCode }: { partyCode: string }) {
    const tracks = useTracks(
        [
            { source: Track.Source.Camera, withPlaceholder: true },
            { source: Track.Source.ScreenShare, withPlaceholder: false },
        ],
        { onlySubscribed: false },
    );

    // Amankan pemilahan tracks agar terhindar dari error internal LiveKit
    const validTracks = tracks.filter(t => t && t.participant && t.participant.identity);
    const ourTracks = validTracks.filter(t => t.participant.identity.startsWith(partyCode + '_'));
    const theirTracks = validTracks.filter(t => !t.participant.identity.startsWith(partyCode + '_'));

    return (
        <div className="w-full h-full flex flex-col md:flex-row bg-gray-900/20">
            {/* Area Kamera Kita (Kiri) */}
            <div className={`flex-1 ${theirTracks.length > 0 ? 'border-b md:border-b-0 md:border-r border-gray-700/50' : ''}`}>
                <SimpleGrid tracks={ourTracks} />
            </div>
            
            {/* Area Kamera Lawan (Kanan) */}
            {theirTracks.length > 0 && (
                <div className="flex-1 relative">
                    <SimpleGrid tracks={theirTracks} />
                </div>
            )}
        </div>
    );
}

export default function PartyPage() {
    const params = useParams();
    const router = useRouter();
    const code = (params.code as string).toUpperCase();
    const { state, joinParty, findMatch, cancelMatch, skipParty, proposeGame, acceptGame, rejectGame, startGame, drawLine, clearCanvas, guessWord, closeGame } = useParty();
    const { playClick, playSearching, playMatched, playSkip } = useSound();
    const [name, setName] = useState('');
    const [joined, setJoined] = useState(false);
    const [copied, setCopied] = useState(false);
    const [lobbyToken, setLobbyToken] = useState('');
    const [lobbyUrl, setLobbyUrl] = useState('');
    const prevStatusRef = useRef(state.status);

    // Ambil nama dari localStorage (kalau dari home)
    useEffect(() => {
        const savedName = localStorage.getItem('participantName');
        if (savedName) {
            setName(savedName);
        }
    }, []);

    // Auto join kalau nama sudah ada (dari home → redirect)
    useEffect(() => {
        if (name && !joined && state.clientId) {
            joinParty(code, name);
            setJoined(true);
        }
    }, [name, joined, state.clientId]);

    // Kalau matched → redirect ke room video call
    // HAPUS EFEK INI KARENA KITA TIDAK MAU PINDAH HALAMAN
    // useEffect(() => {
    //     if (state.status === 'matched' && state.roomName) {
    //         router.push(`/room/${state.roomName}`);
    //     }
    // }, [state.status, state.roomName]);

    // Sound effects based on status change
    useEffect(() => {
        if (prevStatusRef.current !== state.status) {
            if (state.status === 'searching') {
                playSearching();
            } else if (state.status === 'matched') {
                playMatched();
            } else if (state.status === 'lobby' && prevStatusRef.current === 'searching') {
                // Cancel match
                playClick();
            }
            prevStatusRef.current = state.status;
        }
    }, [state.status, playSearching, playMatched, playClick]);

    useEffect(() => {
        const targetRoomName = state.status === 'matched' ? state.roomName : `lobby_${code}`;
        if (['lobby', 'searching', 'matched'].includes(state.status) && name && state.clientId && targetRoomName) {
            
            // Hapus token lama agar komponen LiveKit unmount sejenak (mencegah crash)
            setLobbyToken('');
            
            const fetchLobbyToken = async () => {
                try {
                    let backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
                    if (typeof window !== 'undefined' && backendUrl.includes('localhost')) {
                        backendUrl = `http://${window.location.hostname}:3001`;
                    }
                    const res = await fetch(
                        `${backendUrl}/api/token?roomName=${targetRoomName}&participantName=${code}_${name}_${Date.now()}`
                    );
                    const data = await res.json();
                    if (data.token) {
                        setLobbyToken(data.token);
                        setLobbyUrl(data.url);
                    }
                } catch (err) {
                    console.error('Failed to get token', err);
                }
            };
            fetchLobbyToken();
        }
    }, [name, code, state.clientId, state.status, state.roomName]);

    const handleCopyLink = () => {
        navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const isHost = state.clientId === state.hostId;

    const memberVariants = {
        hidden: { opacity: 0, y: 10, scale: 0.95 },
        visible: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, scale: 0.9, transition: { duration: 0.2 } }
    };

    // ── Belum join (buka link langsung tanpa lewat home) ────
    if (!joined || !state.code) {
        return (
            <main className="min-h-screen bg-[#030712] flex flex-col items-center justify-center p-4 relative overflow-hidden">
                {/* Background glow */}
                <div className="absolute top-[-20%] left-[50%] translate-x-[-50%] w-[600px] h-[600px] bg-purple-900/20 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute bottom-[-10%] left-[20%] w-[400px] h-[400px] bg-teal-900/10 rounded-full blur-3xl pointer-events-none" />

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full max-w-sm relative z-10 space-y-6"
                >
                    <div className="text-center space-y-2">
                        <h1 className="text-4xl font-extrabold text-white tracking-tight">
                            Fun<span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-teal-400">Frame</span>
                        </h1>
                        <p className="text-gray-400 text-sm">Kamu diundang ke party!</p>
                        <div className="inline-block mt-2 bg-purple-900/40 border border-purple-500/30 text-purple-300 font-mono tracking-[0.2em] px-4 py-1.5 rounded-full text-lg font-bold shadow-lg shadow-purple-900/20">
                            {code}
                        </div>
                    </div>

                    <div className="bg-gray-900/80 backdrop-blur-sm rounded-3xl p-6 space-y-4 border border-gray-800 shadow-2xl">
                        <div>
                            <label className="text-xs text-gray-500 uppercase tracking-widest mb-2 block">Nama kamu</label>
                            <input
                                type="text"
                                placeholder="Masukkan nama..."
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && name.trim()) {
                                        localStorage.setItem('participantName', name.trim());
                                        joinParty(code, name.trim());
                                        setJoined(true);
                                    }
                                }}
                                className="w-full bg-gray-800/80 text-white rounded-2xl px-4 py-3.5 outline-none focus:ring-2 focus:ring-purple-500/50 placeholder-gray-600 transition border border-gray-700/50 focus:border-purple-500/50"
                            />
                        </div>
                        <button
                            onClick={() => {
                                if (!name.trim()) return alert('Masukkan nama dulu');
                                localStorage.setItem('participantName', name.trim());
                                joinParty(code, name.trim());
                                setJoined(true);
                            }}
                            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 active:scale-95 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-purple-900/30"
                        >
                            <Users size={18} />
                            Gabung Party
                        </button>

                        <AnimatePresence>
                            {state.error && (
                                <motion.p
                                    initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                    className="text-red-400 text-sm text-center bg-red-950/50 border border-red-900/50 rounded-xl py-2.5 px-4"
                                >
                                    ⚠️ {state.error}
                                </motion.p>
                            )}
                        </AnimatePresence>
                    </div>
                </motion.div>
            </main>
        );
    }

    // ── Sudah join → tampilkan lobby atau match ────────────────────────
    const isMatched = state.status === 'matched';

    return (
        <main className="min-h-screen bg-[#030712] flex flex-col lg:flex-row p-4 gap-6 relative overflow-hidden">
            {/* Background glow */}
            <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-purple-900/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-teal-900/10 rounded-full blur-3xl pointer-events-none" />

            {/* Video Area */}
            <div className={`transition-all duration-700 ease-in-out ${isMatched ? 'absolute inset-4 z-20' : 'flex-1 relative'} bg-gray-900/40 border border-gray-800/50 rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col items-center justify-center backdrop-blur-sm min-h-[50vh] lg:min-h-0`}>
                {lobbyToken && lobbyUrl ? (
                    <div className="absolute inset-0 flex flex-col md:flex-row">
                        {/* Area Kamera Kita (Kiri) / Fullscreen saat Matched */}
                        <div className={`relative transition-all duration-700 ease-in-out ${isMatched ? 'w-full h-full' : 'w-full h-1/2 md:h-full md:w-1/2 border-b md:border-b-0 md:border-r border-gray-800/50'}`}>
                            <LiveKitRoom
                                key={lobbyToken}
                                token={lobbyToken}
                                serverUrl={lobbyUrl}
                                connect={true}
                                video={true}
                                audio={true}
                                data-lk-theme="default"
                                className="w-full h-full"
                            >
                                <MyVideoGrid partyCode={code} />
                                <RoomAudioRenderer />
                                
                                {/* Mute Controls saat BELUM matched (Tampil kecil di atas kamera sendiri) */}
                                {!isMatched && (
                                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-50">
                                        <TrackToggle source={Track.Source.Microphone} className="!bg-gray-900/80 hover:!bg-gray-800 !rounded-full !w-10 !h-10 !p-0 flex items-center justify-center border border-gray-700/50 shadow-lg text-white backdrop-blur-sm transition-all" />
                                        <TrackToggle source={Track.Source.Camera} className="!bg-gray-900/80 hover:!bg-gray-800 !rounded-full !w-10 !h-10 !p-0 flex items-center justify-center border border-gray-700/50 shadow-lg text-white backdrop-blur-sm transition-all" />
                                    </div>
                                )}

                                {/* Floating controls saat matched (Pindah ke dalam LiveKitRoom agar bisa akses mic/camera state) */}
                                {isMatched && (!state.gameState || ['inviting', 'rejected'].includes(state.gameState.status)) && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
                                        className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col sm:flex-row items-center justify-center gap-3 z-50 w-[90%] sm:w-max bg-gray-900/60 p-2 sm:p-3 rounded-[2rem] sm:rounded-full backdrop-blur-md border border-gray-700/50"
                                    >
                                        {/* Mute Mic / Video Controls bawaan LiveKit yang sudah di-style kustom */}
                                        <div className="flex gap-2 w-full sm:w-auto justify-center">
                                            <TrackToggle source={Track.Source.Microphone} className="!bg-gray-800 hover:!bg-gray-700 !rounded-full !w-12 !h-12 !p-0 flex items-center justify-center border border-gray-600/50 shadow-lg text-white transition-all" />
                                            <TrackToggle source={Track.Source.Camera} className="!bg-gray-800 hover:!bg-gray-700 !rounded-full !w-12 !h-12 !p-0 flex items-center justify-center border border-gray-600/50 shadow-lg text-white transition-all" />
                                        </div>
                                        
                                        {isHost && (
                                            <button
                                                onClick={() => { 
                                                    playClick(); 
                                                    if (state.gameState?.status !== 'inviting') proposeGame(); 
                                                }}
                                                disabled={state.gameState?.status === 'inviting'}
                                                className={`w-full sm:w-auto ${state.gameState?.status === 'inviting' ? 'bg-gray-600' : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500'} text-white font-bold py-3 px-6 rounded-full shadow-xl shadow-purple-900/30 flex items-center justify-center gap-2 transition-transform active:scale-95 border border-purple-400/50`}
                                            >
                                                <Gamepad2 size={20} className={state.gameState?.status === 'inviting' ? 'animate-pulse' : ''} />
                                                {state.gameState?.status === 'inviting' ? 'Menunggu Jawaban...' : 'Tebak Gambar'}
                                            </button>
                                        )}
                                        {isHost ? (
                                            <button
                                                onClick={() => { playSkip(); skipParty(); }}
                                                className="w-full sm:w-auto bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 text-white font-bold py-3 px-6 rounded-full shadow-xl shadow-red-900/30 flex items-center justify-center gap-2 transition-transform active:scale-95 border border-red-400/50"
                                            >
                                                <Search size={20} />
                                                Cari Lain!
                                            </button>
                                        ) : (
                                            <div className="bg-gray-800/80 text-gray-400 text-sm py-3 px-6 rounded-full border border-gray-600/50">
                                                Menunggu leader...
                                            </div>
                                        )}
                                        <button
                                            onClick={() => router.push('/')}
                                            className="w-full sm:w-auto bg-red-900/80 hover:bg-red-800 text-white py-3 px-6 rounded-full border border-red-700/50 flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-xl shadow-black/50"
                                            title="Keluar Party"
                                        >
                                            <LogOut size={20} />
                                            Keluar
                                        </button>
                                    </motion.div>
                                )}

                                {/* Overlay Ajakan Bermain (Invited) */}
                                {state.gameState?.status === 'invited' && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                                        className="absolute inset-0 flex items-center justify-center z-50 bg-black/60 backdrop-blur-sm p-4"
                                    >
                                        <div className="bg-gray-900 border border-purple-500/50 p-6 md:p-8 rounded-[2rem] shadow-2xl flex flex-col items-center max-w-md text-center">
                                            <div className="w-20 h-20 bg-purple-900/40 rounded-full flex items-center justify-center mb-4">
                                                <Gamepad2 className="text-purple-400 animate-bounce" size={40} />
                                            </div>
                                            <h2 className="text-2xl font-bold text-white mb-2">Tantangan Bermain!</h2>
                                            <p className="text-gray-400 mb-8">Pihak lawan menantang geng Anda untuk bermain <b>Tebak Gambar</b>. Apakah Anda siap menerimanya?</p>
                                            
                                            {isHost ? (
                                                <div className="flex gap-3 w-full">
                                                    <button onClick={() => { playClick(); rejectGame(); }} className="flex-1 py-3.5 px-4 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-medium transition-all active:scale-95">Tolak</button>
                                                    <button onClick={() => { playClick(); acceptGame(); }} className="flex-1 py-3.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold transition-all shadow-lg shadow-purple-900/50 active:scale-95">Terima Tantangan</button>
                                                </div>
                                            ) : (
                                                <div className="bg-yellow-900/30 text-yellow-500 text-sm italic py-3 px-6 rounded-full border border-yellow-700/50">
                                                    Menunggu keputusan ketua party Anda...
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                )}

                                {/* Toast Penolakan (Rejected) */}
                                <AnimatePresence>
                                    {state.gameState?.status === 'rejected' && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                                            className="absolute top-6 left-1/2 -translate-x-1/2 z-50 bg-red-900/90 border border-red-500 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 backdrop-blur-md"
                                        >
                                            <X size={20} />
                                            <span className="font-medium">Pihak lawan menolak ajakan bermain.</span>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                            </LiveKitRoom>
                        </div>

                        {/* Area Mencari Lawan (Kanan) - Hanya tampil saat belum matched */}
                        {!isMatched && (
                            <div className="w-full h-1/2 md:h-full md:w-1/2 bg-gray-900/80 flex flex-col items-center justify-center relative overflow-hidden backdrop-blur-md">
                                <div className="absolute inset-0 bg-gradient-to-br from-purple-900/10 to-indigo-900/10 pointer-events-none" />
                                
                                {state.status === 'searching' ? (
                                    <>
                                        <div className="w-20 h-20 rounded-full bg-gray-800/80 flex items-center justify-center mb-6 border border-gray-700/50 shadow-2xl relative z-10">
                                            <Radar className="animate-spin text-indigo-400" size={40} style={{ animationDuration: '2s' }} />
                                            <div className="absolute inset-0 border-4 border-indigo-500/30 rounded-full animate-ping" style={{ animationDuration: '2s' }} />
                                        </div>
                                        <h3 className="text-xl font-bold text-gray-200 mb-2 relative z-10">Mencari Lawan Bicara...</h3>
                                        <p className="text-gray-500 text-sm relative z-10 text-center px-6">Tunggu sebentar ya, kami sedang mencarikan teman yang pas buat kamu.</p>
                                        
                                        {isHost && (
                                            <button 
                                                onClick={cancelMatch}
                                                className="mt-8 relative z-10 px-6 py-2.5 rounded-full bg-red-900/40 hover:bg-red-800/60 text-red-300 border border-red-800/50 transition-all font-medium flex items-center gap-2 active:scale-95"
                                            >
                                                <X size={16} /> Batal Mencari
                                            </button>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <div className="w-20 h-20 rounded-full bg-gray-800/80 flex items-center justify-center mb-6 border border-gray-700/50 shadow-2xl relative z-10">
                                            <Users className="text-gray-400" size={40} />
                                        </div>
                                        <h3 className="text-xl font-bold text-gray-200 mb-2 relative z-10">Ruang Tunggu</h3>
                                        <p className="text-gray-500 text-sm relative z-10 text-center px-6">Kamera Anda sudah siap. Klik tombol di bawah untuk mulai mencari lawan.</p>
                                        
                                        {isHost ? (
                                            <button 
                                                onClick={() => { playSearching(); findMatch(); }}
                                                className="mt-8 relative z-10 px-8 py-3 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all flex items-center gap-2 shadow-lg shadow-indigo-900/20 active:scale-95"
                                            >
                                                <Search size={18} /> Mulai Mencari
                                            </button>
                                        ) : (
                                            <div className="mt-8 bg-gray-800/80 text-gray-400 text-sm py-3 px-6 rounded-full border border-gray-600/50">
                                                Menunggu Leader Memulai...
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center space-y-4 text-gray-500">
                        <div className="w-16 h-16 rounded-full bg-gray-800/50 flex items-center justify-center mb-2">
                            <Radar className="animate-spin text-purple-500/50" size={32} style={{ animationDuration: '3s' }} />
                        </div>
                        <p className="font-medium animate-pulse text-sm">Menyiapkan Kamera...</p>
                    </div>
                )}

                {/* Skribbl Board Overlay */}
                {state.gameState && ['playing', 'gameover', 'showcase'].includes(state.gameState.status) && (
                    <SkribblBoard
                        state={state}
                        drawLine={drawLine}
                        clearCanvas={clearCanvas}
                        guessWord={guessWord}
                        closeBoard={closeGame}
                    />
                )}
            </div>

            {/* Sidebar Control (Kanan pada desktop, Bawah pada mobile) */}
            <AnimatePresence>
                {!isMatched && (
                    <motion.div
                        initial={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20, transition: { duration: 0.3 } }}
                        className="w-full lg:w-[420px] shrink-0 relative z-10 flex flex-col justify-center"
                    >
                        <div className="space-y-6">

                            {/* Header */}
                            <motion.div
                                initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
                                className="text-center lg:text-left"
                            >
                                <h1 className="text-4xl font-extrabold text-white tracking-tight">
                                    Party <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-teal-400">Lobby</span>
                                </h1>
                                <p className="text-gray-400 text-sm mt-1.5">Ruang tunggu sebelum mencari lawan.</p>
                            </motion.div>

                            {/* Party Card */}
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                                className="bg-gray-900/80 backdrop-blur-md rounded-3xl p-6 space-y-6 border border-gray-800 shadow-2xl relative overflow-hidden"
                            >
                                {/* Searching Overlay */}
                                <AnimatePresence>
                                    {state.status === 'searching' && (
                                        <motion.div
                                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                            className="absolute inset-0 z-20 bg-gray-950/80 backdrop-blur-sm flex flex-col items-center justify-center border border-purple-500/30 rounded-3xl"
                                        >
                                            <div className="relative flex items-center justify-center mb-6">
                                                <div className="absolute w-24 h-24 border-2 border-purple-500/40 rounded-full animate-ping" />
                                                <div className="absolute w-16 h-16 border-2 border-teal-500/40 rounded-full animate-ping" style={{ animationDelay: '0.2s' }} />
                                                <div className="w-12 h-12 bg-gradient-to-tr from-purple-600 to-teal-600 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(168,85,247,0.5)]">
                                                    <Radar className="text-white animate-spin" size={24} style={{ animationDuration: '3s' }} />
                                                </div>
                                            </div>
                                            <h3 className="text-xl font-bold text-white mb-1">Mencari Match</h3>
                                            <p className="text-purple-300/80 text-sm mb-8 animate-pulse">Mencocokkan party kamu dengan party lain...</p>

                                            {isHost && (
                                                <button
                                                    onClick={() => { playClick(); cancelMatch(); }}
                                                    className="flex items-center gap-2 bg-gray-800/80 hover:bg-gray-700/80 text-gray-300 font-medium py-2.5 px-6 rounded-full transition border border-gray-700"
                                                >
                                                    <X size={16} /> Batalkan
                                                </button>
                                            )}
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* Kode Party & Invite */}
                                <div className="bg-gray-950/50 rounded-2xl p-4 border border-gray-800/50 flex items-center justify-between">
                                    <div>
                                        <p className="text-gray-500 text-[10px] uppercase tracking-widest font-semibold mb-0.5">Kode Party</p>
                                        <p className="text-2xl font-bold font-mono text-white tracking-[0.2em]">{code}</p>
                                    </div>
                                    <button
                                        onClick={handleCopyLink}
                                        className={`flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl transition font-medium ${copied ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700'}`}
                                    >
                                        {copied ? <Check size={16} /> : <Copy size={16} />}
                                        {copied ? 'Tersalin' : 'Invite'}
                                    </button>
                                </div>

                                {/* Member List */}
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <p className="text-gray-500 text-xs uppercase tracking-widest font-semibold">
                                            Member
                                        </p>
                                        <span className="bg-gray-800 text-gray-400 text-xs px-2 py-0.5 rounded-full font-medium">
                                            {state.members.length}/4
                                        </span>
                                    </div>

                                    <div className="space-y-2">
                                        <AnimatePresence>
                                            {state.members.map((member) => (
                                                <motion.div
                                                    key={member.clientId}
                                                    variants={memberVariants}
                                                    initial="hidden" animate="visible" exit="exit"
                                                    layout
                                                    className="flex items-center gap-3 bg-gray-800/50 rounded-2xl px-4 py-3 border border-gray-700/30"
                                                >
                                                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white font-bold shadow-inner">
                                                        {member.name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-gray-100 font-medium leading-none mb-1">{member.name}</span>
                                                        {member.clientId === state.hostId && (
                                                            <span className="flex items-center gap-1 text-[10px] text-amber-400 font-medium tracking-wide uppercase">
                                                                <Crown size={10} /> Party Leader
                                                            </span>
                                                        )}
                                                    </div>
                                                    {member.clientId === state.clientId && (
                                                        <span className="ml-auto text-[10px] bg-gray-700 text-gray-300 px-2.5 py-1 rounded-full font-medium uppercase tracking-wider">
                                                            Kamu
                                                        </span>
                                                    )}
                                                </motion.div>
                                            ))}
                                        </AnimatePresence>

                                        {/* Empty slots */}
                                        {Array.from({ length: 4 - state.members.length }).map((_, i) => (
                                            <motion.div
                                                key={`empty-${i}`}
                                                layout
                                                className="flex items-center gap-3 bg-gray-900/30 rounded-2xl px-4 py-3 border border-dashed border-gray-700/50 opacity-50"
                                            >
                                                <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-gray-600">
                                                    <User size={18} />
                                                </div>
                                                <span className="text-gray-500 text-sm font-medium">Menunggu teman...</span>
                                            </motion.div>
                                        ))}
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="pt-2 flex gap-3">
                                    {isHost ? (
                                        <button
                                            onClick={() => { playClick(); findMatch(); }}
                                            className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-teal-600 hover:from-purple-500 hover:to-teal-500 active:scale-95 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-purple-900/30 text-lg"
                                        >
                                            <Search size={20} />
                                            Cari Match!
                                        </button>
                                    ) : (
                                        <div className="flex-1 bg-gray-950/50 border border-gray-800/50 rounded-2xl flex items-center justify-center py-4 text-gray-500 text-sm font-medium">
                                            Menunggu leader mencari match...
                                        </div>
                                    )}
                                    <button
                                        onClick={() => router.push('/')}
                                        className="bg-red-500/10 hover:bg-red-500/20 text-red-400 active:scale-95 p-4 rounded-2xl transition-all border border-red-500/20"
                                        title="Keluar Party"
                                    >
                                        <LogOut size={24} />
                                    </button>
                                </div>
                            </motion.div>

                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </main>
    );
}