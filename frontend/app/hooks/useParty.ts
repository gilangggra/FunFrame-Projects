import { useEffect, useRef, useState, useCallback } from 'react';

export interface Member {
    clientId: string;
    name: string;
}

export interface ChatMessage {
    sender: string;
    text: string;
}

export interface GameState {
    status: 'inviting' | 'invited' | 'rejected' | 'playing' | 'showcase' | 'gameover';
    proposer?: string;
    rejector?: string;
    drawer?: string;
    word?: string;
    lines?: any[];
    chat?: ChatMessage[];
    winner?: string;
}

export interface PartyState {
    code: string | null;
    members: Member[];
    hostId: string | null;
    status: 'idle' | 'lobby' | 'searching' | 'matched';
    roomName: string | null;
    clientId: string | null;
    error: string | null;
    gameState: GameState | null;
}

const INITIAL_STATE: PartyState = {
    code: null,
    members: [],
    hostId: null,
    status: 'idle',
    roomName: null,
    clientId: null,
    error: null,
    gameState: null,
};

export function useParty() {
    const ws = useRef<WebSocket | null>(null);
    const [state, setState] = useState<PartyState>(INITIAL_STATE);

    // Update state sebagian
    const patch = useCallback((partial: Partial<PartyState>) => {
        setState(prev => ({ ...prev, ...partial }));
    }, []);

    // Connect WebSocket
    useEffect(() => {
        let backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
        if (typeof window !== 'undefined' && backendUrl.includes('localhost')) {
            backendUrl = `http://${window.location.hostname}:3001`;
        }
        const wsUrl = backendUrl.replace(/^http/, 'ws');
        const socket = new WebSocket(wsUrl);
        ws.current = socket;

        socket.onopen = () => {
            console.log('✅ WS Connected to', wsUrl);
        };

        socket.onerror = (err) => {
            console.error('❌ WS Error:', err);
            patch({ error: 'Gagal terhubung ke server (koneksi ditolak). Pastikan Anda berada di jaringan yang sama atau port 3001 terbuka.' });
        };

        socket.onclose = () => {
            console.log('🔌 WS Closed');
            patch({ error: 'Koneksi ke server terputus.' });
        };

        socket.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            console.log('📨 WS message:', msg);

            switch (msg.type) {
                case 'CONNECTED':
                    patch({ clientId: msg.clientId });
                    break;

                case 'PARTY_CREATED':
                    patch({
                        code: msg.code,
                        members: msg.members,
                        hostId: msg.members[0]?.clientId,
                        status: 'lobby',
                        error: null,
                    });
                    break;

                case 'PARTY_JOINED':
                    patch({
                        code: msg.code,
                        members: msg.members,
                        hostId: msg.hostId,
                        status: 'lobby',
                        error: null,
                    });
                    break;

                case 'PARTY_UPDATED':
                    patch({
                        members: msg.members,
                        hostId: msg.hostId ?? null,
                    });
                    break;

                case 'SEARCHING':
                    patch({ status: 'searching' });
                    break;

                case 'CANCELLED':
                    patch({ status: 'lobby' });
                    break;

                case 'MATCHED':
                    patch({ status: 'matched', roomName: msg.roomName });
                    break;

                case 'SKIPPING':
                    patch({ status: 'searching', roomName: null, gameState: null });
                    break;

                case 'ERROR':
                    patch({ error: msg.message });
                    break;

                // ── GAME EVENTS ────────────────────────
                case 'GAME_INVITATION':
                    setState(prev => ({
                        ...prev,
                        gameState: {
                            status: msg.proposer === prev.code ? 'inviting' : 'invited',
                            proposer: msg.proposer
                        }
                    }));
                    break;
                case 'GAME_REJECTED':
                    patch({
                        gameState: {
                            status: 'rejected',
                            rejector: msg.rejector
                        }
                    });
                    // Clear rejection status after 3 seconds
                    setTimeout(() => {
                        setState(prev => {
                            if (prev.gameState?.status === 'rejected') {
                                return { ...prev, gameState: null };
                            }
                            return prev;
                        });
                    }, 3000);
                    break;
                case 'GAME_STARTED':
                    patch({
                        gameState: {
                            status: 'playing',
                            drawer: msg.drawer,
                            word: msg.word,
                            lines: [],
                            chat: []
                        }
                    });
                    break;
                case 'DRAW_LINE':
                    setState(prev => {
                        if (!prev.gameState) return prev;
                        return {
                            ...prev,
                            gameState: {
                                ...prev.gameState,
                                lines: [...(prev.gameState.lines || []), msg.line]
                            }
                        };
                    });
                    break;
                case 'CLEAR_CANVAS':
                    setState(prev => {
                        if (!prev.gameState) return prev;
                        return {
                            ...prev,
                            gameState: {
                                ...prev.gameState,
                                lines: []
                            }
                        };
                    });
                    break;
                case 'CHAT_MESSAGE':
                    setState(prev => {
                        if (!prev.gameState) return prev;
                        return {
                            ...prev,
                            gameState: {
                                ...prev.gameState,
                                chat: [...(prev.gameState.chat || []), msg.chat]
                            }
                        };
                    });
                    break;
                case 'GAME_OVER':
                    setState(prev => {
                        if (!prev.gameState) return prev;
                        return {
                            ...prev,
                            gameState: {
                                ...prev.gameState,
                                status: 'showcase',
                                winner: msg.winner,
                                word: msg.word,
                                lines: msg.lines
                            }
                        };
                    });
                    break;
                case 'CLOSE_GAME':
                    patch({ gameState: null });
                    break;
            }
        };

        socket.onclose = () => console.log('🔌 WS disconnected');
        socket.onerror = (e) => {
            // Ignore error if it happens because of React Strict Mode cleanup closing a connecting socket
            if (socket.readyState === WebSocket.CLOSING || socket.readyState === WebSocket.CLOSED) return;
            console.error('WS error:', e);
        };

        return () => {
            socket.close();
        };
    }, [patch]);

    // ── Actions ──────────────────────────────────────────────

    const send = useCallback((payload: object) => {
        if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify(payload));
        }
    }, []);

    const createParty = useCallback((name: string) => {
        send({ type: 'CREATE_PARTY', name });
    }, [send]);

    const joinParty = useCallback((code: string, name: string) => {
        send({ type: 'JOIN_PARTY', code, name });
    }, [send]);

    const findMatch = useCallback(() => {
        send({ type: 'FIND_MATCH' });
    }, [send]);

    const cancelMatch = useCallback(() => {
        send({ type: 'CANCEL_MATCH' });
    }, [send]);

    const skipParty = useCallback(() => {
        send({ type: 'SKIP_PARTY' });
    }, [send]);

    // ── GAME ACTIONS ────────────────────────
    const proposeGame = useCallback(() => {
        send({ type: 'PROPOSE_GAME' });
    }, [send]);

    const acceptGame = useCallback(() => {
        send({ type: 'ACCEPT_GAME' });
    }, [send]);

    const rejectGame = useCallback(() => {
        send({ type: 'REJECT_GAME' });
    }, [send]);

    const startGame = useCallback(() => {
        send({ type: 'START_GAME' });
    }, [send]);

    const drawLine = useCallback((line: any) => {
        send({ type: 'DRAW_LINE', line });
    }, [send]);

    const clearCanvas = useCallback(() => {
        send({ type: 'CLEAR_CANVAS' });
    }, [send]);

    const guessWord = useCallback((word: string) => {
        send({ type: 'GUESS_WORD', word });
    }, [send]);

    const closeGame = useCallback(() => {
        send({ type: 'CLOSE_GAME' });
    }, [send]);

    return {
        state,
        createParty, joinParty, findMatch, cancelMatch, skipParty,
        proposeGame, acceptGame, rejectGame, startGame, drawLine, clearCanvas, guessWord, closeGame
    };
}