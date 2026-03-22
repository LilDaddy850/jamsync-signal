const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3030;
const rooms = new Map(); // roomId -> [ws1, ws2]

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws) => {
  let currentRoom = null;

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);

      if (msg.type === 'join') {
        currentRoom = msg.room;
        if (!rooms.has(currentRoom)) {
          rooms.set(currentRoom, []);
        }
        const room = rooms.get(currentRoom);
        room.push(ws);
        console.log(`Peer joined room "${currentRoom}" (${room.length}/2)`);

        if (room.length === 2) {
          // Tell both peers the room is ready
          room.forEach(peer => {
            peer.send(JSON.stringify({ type: 'ready', peers: room.length }));
          });
        } else {
          ws.send(JSON.stringify({ type: 'waiting' }));
        }
      }

      if (msg.type === 'signal') {
        // Relay signal data to the other peer in the room
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
        // Notify remaining peer
        room.forEach(peer => {
          peer.send(JSON.stringify({ type: 'peer_left' }));
        });
      }
      console.log(`Peer left room "${currentRoom}"`);
    }
  });
});

console.log(`JamSync signaling server running on ws://localhost:${PORT}`);
console.log('Peers join a room, exchange STUN addresses, then connect directly.');
