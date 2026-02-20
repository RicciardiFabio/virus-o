
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;

  // Room state
  // Map<roomId, { id: string, hostId: string, players: Map<socketId, any> }>
  const rooms = new Map<string, any>();

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('get_rooms', () => {
      const roomsList = Array.from(rooms.values()).map(r => ({
        id: r.id,
        playerCount: r.players.size,
        hostId: r.hostId
      })).filter(r => r.playerCount > 0); // Only send rooms with players
      socket.emit('rooms_list', roomsList);
    });

    socket.on('v2_hello', (data) => {
      const { roomId, name } = data;
      if (!roomId) return;

      socket.join(roomId);

      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          id: roomId,
          hostId: socket.id,
          players: new Map()
        });
      }

      const room = rooms.get(roomId);
      
      // Limit to 30 players
      if (room.players.size >= 30) {
        socket.emit('error', { message: 'Room is full' });
        return;
      }

      room.players.set(socket.id, { id: socket.id, name });

      // If host left and this is the first one, assign as host
      if (!room.hostId || !room.players.has(room.hostId)) {
        room.hostId = socket.id;
      }

      const playersArray = Array.from(room.players.values());
      
      // Welcome the player
      socket.emit('v2_welcome', {
        hostId: room.hostId,
        players: playersArray,
        myAssignedId: socket.id
      });

      // Notify others
      socket.to(roomId).emit('v2_player_joined', { id: socket.id, name });
    });

    socket.on('v2_start', (data) => {
      const { roomId } = data;
      const room = rooms.get(roomId);
      if (room && room.hostId === socket.id) {
        io.to(roomId).emit('v2_start', {});
      }
    });

    socket.on('v2_state', (data) => {
      const { roomId } = data;
      // Broadcast state to everyone else in the room
      socket.to(roomId).emit('v2_state', data);
    });

    socket.on('leave_room', (data) => {
      const { roomId } = data;
      handleLeave(socket, roomId);
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      // Find all rooms this player was in
      rooms.forEach((room, roomId) => {
        if (room.players.has(socket.id)) {
          handleLeave(socket, roomId);
        }
      });
    });

    function handleLeave(socket: any, roomId: string) {
      const room = rooms.get(roomId);
      if (!room) return;

      room.players.delete(socket.id);
      socket.leave(roomId);

      if (room.players.size === 0) {
        rooms.delete(roomId);
        console.log(`Room ${roomId} deleted (empty)`);
      } else {
        if (room.hostId === socket.id) {
          // Assign new host
          const nextHostId = room.players.keys().next().value;
          room.hostId = nextHostId;
          io.to(roomId).emit('v2_host', {
            hostId: room.hostId,
            players: Array.from(room.players.values())
          });
        }
        io.to(roomId).emit('player_left', { playerId: socket.id });
      }
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
