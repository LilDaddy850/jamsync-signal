const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3030;
const rooms = new Map(); // roomId -> [ws1, ws2]

const wss = new WebSocketServer({ port: PORT });

// Clean up stale rooms every 30 seconds
setInterval(() => {
  for (const [id, peers] of rooms) {
    const alive = peers.filter(ws => ws.readyState === 1);
    if (alive.length === 0) {
      rooms.delete(id);
    } else {
      rooms.set(id, alive);
    }
  }
}, 30000);

wss.on('connection', (ws) => {
  let currentRoom = null;

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);

      if (msg.type === 'join') {
        currentRoom = msg.room;
        if (!rooms.has(currentRoom)) {
          rooms.set(currentRoom, []);
        }
        const room = rooms.get(currentRoom);

        // Clean dead sockets from room before checking size
        const alive = room.filter(p => p.readyState === 1);
        rooms.set(currentRoom, alive);

        if (alive.length >= 2) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
          return;
        }

        alive.push(ws);
        rooms.set(currentRoom, alive);
        console.log(`Peer joined room "${currentRoom}" (${alive.length}/2)`);

        if (alive.length === 2) {
          alive.forEach(peer => {
            if (peer.readyState === 1) {
              peer.send(JSON.stringify({ type: 'ready', peers: 2 }));
            }
          });
        } else {
          ws.send(JSON.stringify({ type: 'waiting' }));
        }
      }

      if (msg.type === 'signal') {
        const room = rooms.get(currentRoom) || [];
        room.forEach(peer => {
          if (peer !== ws && peer.readyState === 1) {
            peer.send(JSON.stringify(msg));
          }
        });
      }

    } catch (e) {
      console.error('Bad message:', e.message);
    }
  });

  ws.on('close', () => {
    if (currentRoom && rooms.has(currentRoom)) {
      const room = rooms.get(currentRoom);
      const idx = room.indexOf(ws);
      if (idx !== -1) room.splice(idx, 1);
      if (room.length === 0) {
        rooms.delete(currentRoom);
      } else {
        room.forEach(peer => {
          if (peer.readyState === 1) {
            peer.send(JSON.stringify({ type: 'peer_left' }));
          }
        });
      }
      console.log(`Peer left room "${currentRoom}"`);
    }
  });
});

console.log(`JamSync signaling server running on port ${PORT}`);
