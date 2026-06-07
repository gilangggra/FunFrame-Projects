const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const { AccessToken } = require('livekit-server-sdk');

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server });

// ─── In-memory state ───────────────────────────────────────
const parties = {};   // partyCode → { code, hostId, members: [], status, matchedWith, roomName }
const clients = {};   // clientId → WebSocket
const queue = [];   // array of partyCodes yang sedang cari match
const matchRooms = {}; // roomName → { parties: [codeA, codeB], gameState: null }

// ─── Helper: broadcast ke semua member sebuah party ────────
function broadcastToParty(partyCode, payload) {
    const party = parties[partyCode];
    if (!party) return;
    party.members.forEach(member => {
        const ws = clients[member.clientId];
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(payload));
        }
    });
}

// ─── Helper: broadcast ke dua party di match room ─────────
function broadcastToMatch(roomName, payload) {
    const matchRoom = matchRooms[roomName];
    if (!matchRoom) return;
    matchRoom.parties.forEach(code => broadcastToParty(code, payload));
}

// ─── Helper: coba match dua party dari queue ───────────────
function tryMatch() {
    // Filter queue: hanya party yang masih 'waiting'
    const waiting = queue.filter(code => parties[code]?.status === 'waiting');

    if (waiting.length < 2) return;

    // Cari dua party pertama yang BUKAN last matched satu sama lain
    let codeA = null, codeB = null;
    let found = false;

    for (let i = 0; i < waiting.length; i++) {
        for (let j = i + 1; j < waiting.length; j++) {
            const pA = parties[waiting[i]];
            const pB = parties[waiting[j]];
            
            if (pA.lastMatched !== waiting[j] && pB.lastMatched !== waiting[i]) {
                codeA = waiting[i];
                codeB = waiting[j];
                found = true;
                break;
            }
        }
        if (found) break;
    }

    // Jika tidak nemu yang tidak saling block, ambil saja 2 yang pertama terpaksa
    if (!found) {
        codeA = waiting[0];
        codeB = waiting[1];
    }

    // Hapus keduanya dari queue
    const idxA = queue.indexOf(codeA);
    const idxB = queue.indexOf(codeB);
    [idxA, idxB].sort((a, b) => b - a).forEach(i => {
        if (i > -1) queue.splice(i, 1);
    });

    // Buat room LiveKit dari gabungan dua kode
    const roomName = `match_${codeA}_${codeB}`;

    parties[codeA].status = 'matched';
    parties[codeA].matchedWith = codeB;
    parties[codeB].status = 'matched';
    parties[codeB].matchedWith = codeA;
    parties[codeA].roomName = roomName;
    parties[codeB].roomName = roomName;

    matchRooms[roomName] = {
        parties: [codeA, codeB],
        gameState: null
    };

    // Beritahu kedua party
    broadcastToParty(codeA, { type: 'MATCHED', roomName });
    broadcastToParty(codeB, { type: 'MATCHED', roomName });

    console.log(`🤝 Matched: ${codeA} & ${codeB} -> ${roomName}`);
    
    // Coba match lagi sisa antrian jika ada
    if (queue.filter(code => parties[code]?.status === 'waiting').length >= 2) {
        tryMatch();
    }
}

// ─── WebSocket handler ─────────────────────────────────────
wss.on('connection', (ws) => {
    const clientId = uuidv4();
    clients[clientId] = ws;
    ws.send(JSON.stringify({ type: 'CONNECTED', clientId }));
    console.log(`🔌 Client connected: ${clientId}`);

    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }

        // ── CREATE_PARTY ──────────────────────────────────────
        if (msg.type === 'CREATE_PARTY') {
            const code = Math.random().toString(36).substring(2, 8).toUpperCase();
            parties[code] = {
                code,
                hostId: clientId,
                members: [{ clientId, name: msg.name }],
                status: 'lobby',
                matchedWith: null,
            };
            ws.partyCode = code;
            ws.send(JSON.stringify({ type: 'PARTY_CREATED', code, members: parties[code].members }));
            console.log(`🎉 Party created: ${code} by ${msg.name}`);
        }

        // ── JOIN_PARTY ────────────────────────────────────────
        else if (msg.type === 'JOIN_PARTY') {
            const party = parties[msg.code];
            if (!party) {
                ws.send(JSON.stringify({ type: 'ERROR', message: 'Party tidak ditemukan' }));
                return;
            }
            if (party.members.length >= 4) {
                ws.send(JSON.stringify({ type: 'ERROR', message: 'Party sudah penuh (maks 4 orang)' }));
                return;
            }
            if (party.status === 'matched') {
                ws.send(JSON.stringify({ type: 'ERROR', message: 'Party sudah dalam sesi' }));
                return;
            }

            if (party.deleteTimeout) {
                clearTimeout(party.deleteTimeout);
                delete party.deleteTimeout;
            }

            party.members.push({ clientId, name: msg.name });
            if (party.members.length === 1) {
                party.hostId = clientId;
            }
            ws.partyCode = msg.code;

            // Beritahu semua member update
            broadcastToParty(msg.code, { type: 'PARTY_UPDATED', members: party.members });

            // Beritahu joiner data party lengkap
            ws.send(JSON.stringify({
                type: 'PARTY_JOINED',
                code: msg.code,
                members: party.members,
                hostId: party.hostId,
            }));
            console.log(`👋 ${msg.name} joined party: ${msg.code}`);
        }

        // ── FIND_MATCH ────────────────────────────────────────
        else if (msg.type === 'FIND_MATCH') {
            const code = ws.partyCode;
            const party = parties[code];
            if (!party || party.hostId !== clientId) return;

            party.status = 'waiting';
            queue.push(code);

            broadcastToParty(code, { type: 'SEARCHING' });
            console.log(`🔍 Party ${code} mencari match... (queue: ${queue.length})`);

            tryMatch();
        }

        // ── CANCEL_MATCH ──────────────────────────────────────
        else if (msg.type === 'CANCEL_MATCH') {
            const code = ws.partyCode;
            const party = parties[code];
            if (!party) return;

            party.status = 'lobby';
            const idx = queue.indexOf(code);
            if (idx !== -1) queue.splice(idx, 1);

            broadcastToParty(code, { type: 'CANCELLED' });
            console.log(`❌ Party ${code} cancel match`);
        }
        // ── SKIP_PARTY ────────────────────────────────────────
        else if (msg.type === 'SKIP_PARTY') {
            const code = ws.partyCode;
            const party = parties[code];
            if (!party || party.hostId !== clientId) return;

            const otherCode = party.matchedWith;

            // Set lastMatched agar tidak kembali match dengan orang yang sama
            if (otherCode) {
                party.lastMatched = otherCode;
                if (parties[otherCode]) {
                    parties[otherCode].lastMatched = code;
                }
            }

            // Reset status party yang nge-skip
            party.status = 'waiting';
            party.matchedWith = null;

            // Masuk queue lagi
            if (!queue.includes(code)) queue.push(code);

            // Beritahu member sendiri untuk skip
            broadcastToParty(code, { type: 'SKIPPING' });
            console.log(`⏭️ Party ${code} skip → otomatis mencari match baru`);

            // URUS OTHER PARTY JUGA! Lempar ke antrian otomatis.
            if (otherCode && parties[otherCode]) {
                const otherParty = parties[otherCode];
                otherParty.status = 'waiting';
                otherParty.matchedWith = null;
                if (!queue.includes(otherCode)) queue.push(otherCode);
                
                broadcastToParty(otherCode, { type: 'SKIPPING' });
                console.log(`⏭️ Party ${otherCode} (korban skip) → otomatis mencari match baru`);
            }

            // Hapus game state jika ada
            if (party.roomName && matchRooms[party.roomName]) {
                delete matchRooms[party.roomName];
            }

            // Langsung coba match
            tryMatch();
        }

        // ── SKRIBBL GAME ────────────────────────────────────────
        else if (['PROPOSE_GAME', 'ACCEPT_GAME', 'REJECT_GAME', 'START_GAME', 'DRAW_LINE', 'CLEAR_CANVAS', 'GUESS_WORD', 'CLOSE_GAME'].includes(msg.type)) {
            const code = ws.partyCode;
            const party = parties[code];
            if (!party || party.status !== 'matched' || !party.roomName) return;

            const roomName = party.roomName;
            const matchRoom = matchRooms[roomName];
            if (!matchRoom) return;

            if (msg.type === 'PROPOSE_GAME') {
                if (matchRoom.gameState) return; // sudah jalan
                // Kirim event GAME_INVITATION ke seluruh partisipan di dalam room
                broadcastToMatch(roomName, { type: 'GAME_INVITATION', proposer: code });
                console.log(`📩 Party ${code} proposing game di ${roomName}`);
            }
            else if (msg.type === 'REJECT_GAME') {
                // Kirim event GAME_REJECTED ke seluruh partisipan
                broadcastToMatch(roomName, { type: 'GAME_REJECTED', rejector: code });
                console.log(`❌ Party ${code} mereject game di ${roomName}`);
            }
            else if (msg.type === 'ACCEPT_GAME' || msg.type === 'START_GAME') {
                if (matchRoom.gameState && matchRoom.gameState.status === 'playing') return; // sudah jalan

                // Kumpulkan semua member
                const allMembers = [];
                for (const p of matchRoom.parties) {
                    if (parties[p]) allMembers.push(...parties[p].members);
                }
                if (allMembers.length === 0) return;

                // Pilih drawer acak
                const drawerId = allMembers[Math.floor(Math.random() * allMembers.length)].clientId;
                
                const words = ['KUCING', 'MOBIL', 'PISANG', 'RUMAH', 'POHON', 'SEPATU', 'BURUNG', 'GELAS', 'SEPEDA', 'BOLA', 'KACAMATA', 'LAPTOP', 'PESAWAT', 'BUNGA'];
                const word = words[Math.floor(Math.random() * words.length)];

                matchRoom.gameState = {
                    status: 'playing',
                    drawer: drawerId,
                    word: word,
                    lines: [],
                    chat: [],
                    startTime: Date.now()
                };

                broadcastToMatch(roomName, { type: 'GAME_STARTED', drawer: drawerId, word });
                console.log(`🎨 Game started di ${roomName}. Drawer: ${drawerId}, Word: ${word}`);
            }
            else if (msg.type === 'DRAW_LINE') {
                if (!matchRoom.gameState || matchRoom.gameState.drawer !== clientId) return;
                msg.line.timestamp = Date.now() - matchRoom.gameState.startTime;
                matchRoom.gameState.lines.push(msg.line);
                broadcastToMatch(roomName, { type: 'DRAW_LINE', line: msg.line });
            }
            else if (msg.type === 'CLEAR_CANVAS') {
                if (!matchRoom.gameState || matchRoom.gameState.drawer !== clientId) return;
                matchRoom.gameState.lines = [];
                broadcastToMatch(roomName, { type: 'CLEAR_CANVAS' });
            }
            else if (msg.type === 'GUESS_WORD') {
                if (!matchRoom.gameState) return;
                
                const isCorrect = msg.word.toUpperCase() === matchRoom.gameState.word;
                const member = party.members.find(m => m.clientId === clientId);
                const senderName = member ? member.name : 'Unknown';

                if (isCorrect && matchRoom.gameState.drawer !== clientId) {
                    const winnerWord = matchRoom.gameState.word;
                    const finalLines = matchRoom.gameState.lines;
                    matchRoom.gameState.status = 'showcase';
                    matchRoom.gameState.winner = senderName;
                    broadcastToMatch(roomName, { type: 'GAME_OVER', winner: senderName, word: winnerWord, lines: finalLines });
                    console.log(`🏆 Game Over di ${roomName}. Pemenang: ${senderName}`);
                } else {
                    const chatMsg = { sender: senderName, text: msg.word };
                    matchRoom.gameState.chat.push(chatMsg);
                    broadcastToMatch(roomName, { type: 'CHAT_MESSAGE', chat: chatMsg });
                }
            }
            else if (msg.type === 'CLOSE_GAME') {
                if (!matchRoom.gameState) return;
                matchRoom.gameState = null; // Clear state entirely
                broadcastToMatch(roomName, { type: 'CLOSE_GAME' });
            }
        }
    });

    // ── DISCONNECT ──────────────────────────────────────────
    ws.on('close', () => {
        const code = ws.partyCode;
        if (code && parties[code]) {
            parties[code].members = parties[code].members.filter(m => m.clientId !== clientId);

            if (parties[code].members.length === 0) {
                // Party kosong, tunggu 5 detik sebelum dihapus (kasih waktu reconnect)
                parties[code].deleteTimeout = setTimeout(() => {
                    if (parties[code] && parties[code].members.length === 0) {
                        const idx = queue.indexOf(code);
                        if (idx !== -1) queue.splice(idx, 1);
                        delete parties[code];
                        console.log(`🗑️ Party ${code} dihapus (kosong > 5d)`);
                    }
                }, 5000);
            } else {
                // Assign host baru kalau host yang keluar
                if (parties[code].hostId === clientId) {
                    parties[code].hostId = parties[code].members[0].clientId;
                }
                broadcastToParty(code, { type: 'PARTY_UPDATED', members: parties[code].members, hostId: parties[code].hostId });
            }
        }
        delete clients[clientId];
        console.log(`🔌 Client disconnected: ${clientId}`);
    });
});

// ─── REST: Generate LiveKit token ──────────────────────────
app.get('/api/token', async (req, res) => {
    const { roomName, participantName } = req.query;
    if (!roomName || !participantName) {
        return res.status(400).json({ error: 'roomName dan participantName wajib diisi' });
    }

    const at = new AccessToken(
        process.env.LIVEKIT_API_KEY,
        process.env.LIVEKIT_API_SECRET,
        { identity: participantName, ttl: '1h' }
    );
    at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });

    const token = await at.toJwt();
    return res.json({ token, url: process.env.LIVEKIT_URL });
});

app.get('/', (req, res) => {
    res.json({ status: 'FunFrame backend running', parties: Object.keys(parties).length, queue: queue.length });
});

// ─── Start server ───────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`🚀 Backend running at http://localhost:${PORT}`);
});