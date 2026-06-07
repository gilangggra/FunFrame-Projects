'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PartyState } from '../hooks/useParty';
import { Send, Eraser, Palette, Trophy, X } from 'lucide-react';
import confetti from 'canvas-confetti';

interface Props {
    state: PartyState;
    drawLine: (line: any) => void;
    clearCanvas: () => void;
    guessWord: (word: string) => void;
    closeBoard: () => void; // Optional if we want to dismiss the game over screen
}

export default function SkribblBoard({ state, drawLine, clearCanvas, guessWord, closeBoard }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [color, setColor] = useState('#000000');
    const [guess, setGuess] = useState('');
    const [showcaseDone, setShowcaseDone] = useState(false);

    const gameState = state.gameState;
    const isDrawer = gameState?.drawer === state.clientId;

    // Helper: mendapatkan nama drawer
    const drawerMember = state.members.find(m => m.clientId === gameState?.drawer);
    const drawerName = drawerMember ? drawerMember.name : 'Seseorang';

    // Helper: membuat teks kata rahasia (Kucing -> K _ _ _ _ G jika bukan drawer? Atau _ _ _ _ _ _)
    const hiddenWord = gameState?.word ? gameState.word.replace(/[A-Z]/g, '_ ').trim() : '';

    // Setup Canvas dan me-render ulang lines ketika gameState.lines berubah
    useEffect(() => {
        if (gameState?.status === 'showcase') return; // Dihandle oleh efek animasi di bawah

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Atur ukuran canvas agar tidak buram
        const rect = canvas.getBoundingClientRect();
        if (canvas.width !== rect.width || canvas.height !== rect.height) {
            canvas.width = rect.width;
            canvas.height = rect.height;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 4;

        if (gameState?.lines) {
            gameState.lines.forEach((line) => {
                ctx.beginPath();
                ctx.moveTo(line.startX * canvas.width, line.startY * canvas.height);
                ctx.lineTo(line.endX * canvas.width, line.endY * canvas.height);
                ctx.strokeStyle = line.color;
                ctx.stroke();
            });
        }
    }, [gameState?.lines, gameState?.status]);

    // Animasi Replay untuk Showcase
    useEffect(() => {
        if (gameState?.status === 'showcase') {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const rect = canvas.getBoundingClientRect();
            if (canvas.width !== rect.width || canvas.height !== rect.height) {
                canvas.width = rect.width;
                canvas.height = rect.height;
            }

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = 4;
            
            const lines = gameState.lines || [];
            if (lines.length === 0) {
                setShowcaseDone(true);
                return;
            }

            const start = performance.now();
            const timeMultiplier = 8; // 8x dipercepat dari aslinya
            const maxTimestamp = lines[lines.length - 1].timestamp || 0;
            
            let lastIndex = 0;
            let animationFrameId: number;

            const animate = (time: number) => {
                const elapsed = (time - start) * timeMultiplier;
                
                // Cari garis baru yang harus digambar sampai elapsed time
                while (lastIndex < lines.length && (lines[lastIndex].timestamp || 0) <= elapsed) {
                    const line = lines[lastIndex];
                    ctx.beginPath();
                    ctx.moveTo(line.startX * canvas.width, line.startY * canvas.height);
                    ctx.lineTo(line.endX * canvas.width, line.endY * canvas.height);
                    ctx.strokeStyle = line.color;
                    ctx.stroke();
                    lastIndex++;
                }
                
                if (elapsed < maxTimestamp + 500) {
                    animationFrameId = requestAnimationFrame(animate);
                } else {
                    setShowcaseDone(true);
                    confetti({
                        particleCount: 200,
                        spread: 100,
                        origin: { y: 0.5 },
                        colors: ['#a855f7', '#14b8a6', '#f59e0b']
                    });
                }
            };
            animationFrameId = requestAnimationFrame(animate);
            
            return () => cancelAnimationFrame(animationFrameId);
        } else {
            setShowcaseDone(false); // Reset jika bukan showcase
        }
    }, [gameState?.status]);

    const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawer || gameState?.status !== 'playing') return;
        setIsDrawing(true);
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing || !isDrawer || gameState?.status !== 'playing') return;
        
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const rect = canvas.getBoundingClientRect();
        let clientX, clientY;
        
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = (e as React.MouseEvent).clientX;
            clientY = (e as React.MouseEvent).clientY;
        }

        const x = clientX - rect.left;
        const y = clientY - rect.top;

        // Normalize ke persentase (0 - 1) agar sinkron di semua ukuran layar
        const nx = x / rect.width;
        const ny = y / rect.height;

        // Karena kita butuh titik awal dan akhir, untuk mouse move sederhana:
        // Kita simpan titik terakhir, tapi untuk kesederhanaan, setiap 'move' membuat garis pendek
        // Lebih baik: simpan useRef untuk lastX dan lastY
    };

    const stopDraw = () => {
        setIsDrawing(false);
    };

    // Impelementasi gambar yang lebih presisi dengan useRef
    const lastPos = useRef<{x: number, y: number} | null>(null);

    const onMove = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing || !isDrawer || gameState?.status !== 'playing') return;
        
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const rect = canvas.getBoundingClientRect();
        let clientX, clientY;
        
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = (e as React.MouseEvent).clientX;
            clientY = (e as React.MouseEvent).clientY;
        }

        const nx = (clientX - rect.left) / rect.width;
        const ny = (clientY - rect.top) / rect.height;

        if (lastPos.current) {
            drawLine({
                startX: lastPos.current.x,
                startY: lastPos.current.y,
                endX: nx,
                endY: ny,
                color
            });
        }
        lastPos.current = { x: nx, y: ny };
    };

    const onDown = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawer || gameState?.status !== 'playing') return;
        setIsDrawing(true);
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const rect = canvas.getBoundingClientRect();
        let clientX, clientY;
        
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = (e as React.MouseEvent).clientX;
            clientY = (e as React.MouseEvent).clientY;
        }
        lastPos.current = {
            x: (clientX - rect.left) / rect.width,
            y: (clientY - rect.top) / rect.height
        };
    };

    const onUp = () => {
        setIsDrawing(false);
        lastPos.current = null;
    };

    const handleGuess = (e: React.FormEvent) => {
        e.preventDefault();
        if (guess.trim() && !isDrawer) {
            guessWord(guess.trim());
            setGuess('');
        }
    };

    if (!gameState) return null;

    return (
        <div className="absolute inset-0 z-30 flex flex-col md:flex-row items-stretch p-4 gap-4 pointer-events-none">
            {/* Area Kanvas */}
            <div className="flex-1 flex flex-col pointer-events-auto relative">
                {/* Header Info */}
                <div className="bg-gray-900/90 backdrop-blur-md rounded-t-3xl border border-gray-700/50 p-4 text-center">
                    {gameState.status === 'playing' ? (
                        isDrawer ? (
                            <p className="text-white font-medium text-lg">Kamu menggambar: <span className="font-bold text-teal-400 tracking-widest uppercase">{gameState.word}</span></p>
                        ) : (
                            <p className="text-gray-300">Tebak Gambar <span className="text-purple-400 font-bold">{drawerName}</span>: <span className="font-mono text-2xl ml-2 tracking-widest text-white">{hiddenWord}</span></p>
                        )
                    ) : (
                        <p className="text-yellow-400 font-bold text-xl flex items-center justify-center gap-2">
                            <Trophy size={24} /> Pemenangnya adalah {gameState.winner}!
                        </p>
                    )}
                </div>

                {/* Canvas */}
                <div className="flex-1 bg-white/10 backdrop-blur-md relative overflow-hidden border-x border-b border-gray-700/50 rounded-b-3xl">
                    <canvas
                        ref={canvasRef}
                        className={`w-full h-full ${isDrawer && gameState.status === 'playing' ? 'cursor-crosshair' : 'cursor-default'}`}
                        onMouseDown={onDown}
                        onMouseMove={onMove}
                        onMouseUp={onUp}
                        onMouseOut={onUp}
                        onTouchStart={onDown}
                        onTouchMove={onMove}
                        onTouchEnd={onUp}
                    />

                    {/* Tools untuk Drawer */}
                    {isDrawer && gameState.status === 'playing' && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-gray-900/90 p-2 rounded-2xl flex gap-2 border border-gray-700 shadow-xl">
                            {['#000000', '#EF4444', '#3B82F6', '#10B981', '#F59E0B'].map(c => (
                                <button
                                    key={c}
                                    onClick={() => setColor(c)}
                                    className={`w-8 h-8 rounded-full ${color === c ? 'ring-2 ring-white scale-110' : ''} transition-all`}
                                    style={{ backgroundColor: c }}
                                />
                            ))}
                            <div className="w-px bg-gray-700 mx-2" />
                            <button
                                onClick={clearCanvas}
                                className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-red-400 hover:bg-gray-700 transition-all"
                                title="Hapus Semua"
                            >
                                <Eraser size={16} />
                            </button>
                        </div>
                    )}

                    {/* UI Kemenangan Showcase */}
                    <AnimatePresence>
                        {gameState.status === 'showcase' && showcaseDone && (
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.8, y: 50 }} 
                                animate={{ opacity: 1, scale: 1, y: 0 }} 
                                className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 z-50"
                            >
                                <div className="bg-gray-900 border-2 border-purple-500/50 p-8 rounded-3xl shadow-2xl flex flex-col items-center max-w-lg text-center transform hover:scale-105 transition-transform duration-300">
                                    <div className="w-24 h-24 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-yellow-900/50">
                                        <Trophy className="text-white" size={48} />
                                    </div>
                                    <h2 className="text-3xl font-bold text-white mb-2">🎉 {gameState.winner} Menang! 🎉</h2>
                                    <p className="text-gray-300 text-lg mb-6">Tebakan benar untuk mahakarya <span className="font-bold text-teal-400">{drawerName}</span></p>
                                    
                                    <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 w-full mb-8 relative overflow-hidden">
                                        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-teal-500/10" />
                                        <p className="text-gray-400 text-sm mb-1 uppercase tracking-widest font-bold">Kata Rahasia</p>
                                        <p className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-teal-400 uppercase tracking-widest">
                                            {gameState.word}
                                        </p>
                                    </div>

                                    <button 
                                        onClick={closeBoard}
                                        className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold py-4 px-10 rounded-full shadow-lg transition-transform active:scale-95 flex items-center gap-2"
                                    >
                                        <X size={20} /> Tutup & Kembali
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Sidebar Chat / Guess */}
            <div className="w-full md:w-80 flex flex-col pointer-events-auto bg-gray-900/80 backdrop-blur-md rounded-3xl border border-gray-700/50 overflow-hidden h-64 md:h-auto">
                <div className="bg-gray-800/80 p-3 text-center border-b border-gray-700/50">
                    <h3 className="text-gray-300 font-bold text-sm uppercase tracking-widest">Tebakan & Chat</h3>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-2 flex flex-col justify-end">
                    {gameState.chat?.map((msg, i) => (
                        <div key={i} className="text-sm">
                            <span className="font-bold text-purple-400">{msg.sender}:</span> <span className="text-gray-300">{msg.text}</span>
                        </div>
                    ))}
                    {gameState.status === 'gameover' && (
                        <div className="text-center p-3 bg-yellow-500/20 text-yellow-300 rounded-xl mt-4 animate-bounce">
                            🎉 {gameState.winner} menebak dengan benar! <br/> Katanya adalah: <b>{gameState.word}</b>
                        </div>
                    )}
                </div>

                {!isDrawer && gameState.status === 'playing' && (
                    <form onSubmit={handleGuess} className="p-3 bg-gray-800/50 border-t border-gray-700/50 flex gap-2">
                        <input 
                            type="text" 
                            value={guess}
                            onChange={e => setGuess(e.target.value)}
                            placeholder="Tebak kata..."
                            className="flex-1 bg-gray-900 text-white rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-teal-500 border border-gray-700"
                        />
                        <button type="submit" className="bg-teal-600 hover:bg-teal-500 text-white p-2 rounded-xl transition-colors">
                            <Send size={18} />
                        </button>
                    </form>
                )}

                {gameState.status === 'gameover' && (
                    <div className="p-3 bg-gray-800/50 border-t border-gray-700/50 flex justify-center">
                        <button 
                            onClick={closeBoard}
                            className="bg-gray-700 hover:bg-gray-600 text-white py-2 px-6 rounded-xl flex items-center gap-2"
                        >
                            <X size={16} /> Tutup
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
