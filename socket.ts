// socket.ts - VERSIONE CORRETTA (WebSocket Priority)
import { io, Socket } from 'socket.io-client';

// Usa l'origine corrente per connettersi al server locale (porta 3000)
const SOCKET_URL = window.location.origin; 

export const socket: Socket = io(SOCKET_URL, {
  transports: ['websocket'], // FORZA l'uso dei WebSocket per evitare "xhr poll error"
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  autoConnect: true,
});

export const socketService = {
  // Restituisce l'ID attuale senza errori
  get socketId(): string | null {
    return socket.id || null;
  },

  connect() {
    if (!socket.connected) {
      socket.connect();
    }
  },

  emit(event: string, data: any) {
    if (socket.connected) {
      socket.emit(event, data);
    }
  },

  on(event: string, callback: (...args: any[]) => void) {
    socket.on(event, callback);
  },

  off(event: string, callback?: (...args: any[]) => void) {
    if (callback) {
      socket.off(event, callback);
    } else {
      socket.removeAllListeners(event);
    }
  }
};

// Log di controllo migliorato
socket.on('connect', () => {
  console.log("✅ Socket Connesso (WebSocket). ID:", socket.id);
});

socket.on('connect_error', (err) => {
  console.error("❌ Errore Connessione Socket:", err.message);
});