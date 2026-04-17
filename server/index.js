const express = require("express");
const cors = require("cors");
const http = require("http");
const path = require("path");
const app = express();
let dotenv = require("dotenv");
dotenv.config({ path: path.join(__dirname, ".env") });

const server = http.createServer(app);
const { Server } = require("socket.io");

function getAllowedOrigins() {
  return (process.env.SOCKET_IO_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const allowedOrigins = getAllowedOrigins();
const corsOptions = {
  origin: allowedOrigins.length ? allowedOrigins : true,
  methods: ["GET", "POST"],
};

const io = new Server(server, {
  cors: corsOptions,
});

app.use(cors(corsOptions));

function sendRuntimeConfig(res) {
  const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY || "",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.FIREBASE_PROJECT_ID || "",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "",
    appId: process.env.FIREBASE_APP_ID || "",
    measurementId: process.env.FIREBASE_MEASUREMENT_ID || "",
  };
  const backendUrl = process.env.BACKEND_URL || "";

  res
    .set("Cache-Control", "no-store")
    .type("application/javascript")
    .send(
      `window.__FIREBASE_CONFIG__ = ${JSON.stringify(firebaseConfig)};\nwindow.BACKEND_URL = ${JSON.stringify(
        backendUrl
      )};`
    );
}

app.get("/runtime-config.js", (req, res) => {
  sendRuntimeConfig(res);
});

app.get("/config.js", (req, res) => {
  sendRuntimeConfig(res);
});

const sqlite3 = require('sqlite3').verbose();
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('Error opening database', err);
  else {
    db.run(`CREATE TABLE IF NOT EXISTS guestbook (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  }
});

app.use(express.json());

app.get('/api/guestbook', (req, res) => {
  db.all(`SELECT name, message, created_at FROM guestbook ORDER BY id DESC LIMIT 10`, [], (err, rows) => {
    if (err) return res.status(500).json({error: err.message});
    res.json(rows);
  });
});

app.post('/api/guestbook', (req, res) => {
  const { name, message } = req.body;
  if (!name || !message) return res.status(400).json({error: 'Name and message required'});
  db.run(`INSERT INTO guestbook (name, message) VALUES (?, ?)`, [name, message], function(err) {
    if (err) return res.status(500).json({error: err.message});
    res.json({ id: this.lastID, name, message });
  });
});

app.use(express.static(path.join(__dirname, "../public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.get("/room/:roomId", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

let rooms = [];
const Port = process.env.PORT || 5001;

function getRoom(roomId) {
  return rooms.find((room) => room.roomId === roomId);
}

function emitParticipants(roomId) {
  const room = getRoom(roomId);
  if (!room) return;

  io.in(roomId).emit(
    "roomParticipants",
    room.participants.map((participant) => ({
      socketId: participant.socketId,
      userName: participant.userName,
    }))
  );
}

function emitSystemMessage(roomId, message) {
  io.in(roomId).emit("getMessage", {
    type: "system",
    roomId,
    message,
  });
}

io.on("connection", (socket) => {
  console.log("a user connected");
  // Join Room
  socket.on("joinRoom", (data) => {
    console.log("joined room", data.roomId);
    socket.join(data.roomId);
    socket.data.roomId = data.roomId;
    socket.data.userName = data.userName || "Guest";

    let room = getRoom(data.roomId);
    if (room) {
      // uppdate the new user with the current canvas
      io.to(socket.id).emit("updateCanvas", room);
    } else {
      room = {
        roomId: data.roomId,
        updatedElements: [],
        participants: [],
        canvasColor: "#121212",
      };
      rooms.push(room);
    }

    room.participants = room.participants.filter(
      (participant) => participant.socketId !== socket.id
    );
    room.participants.push({
      socketId: socket.id,
      userName: socket.data.userName,
    });

    emitParticipants(data.roomId);
    emitSystemMessage(data.roomId, `${socket.data.userName} joined the live room`);
  });
  // update the canvas
  socket.on("updateCanvas", (data) => {
    // Broadcast the updated elements to all connected clients
    socket.to(data.roomId).emit("updateCanvas", data);
    const room = getRoom(data.roomId);
    if (room) {
      room.updatedElements = data.updatedElements;
      room.canvasColor = data.canvasColor;
    }
  });

  // send message
  socket.on("sendMessage", (data) => {
    // Broadcast the message to all connected clients in the room (including sender)
    io.in(data.roomId).emit("getMessage", data);
  });

  // ping server every 2 min to prevent render server from sleeping
  socket.on("pong", () => {
    setTimeout(() => {
      socket.emit("ping");
    }, 120000);
  });

  //clear elements when no one is in the room
  socket.on("disconnect", () => {
    rooms = rooms.filter((room) => {
      const participant = room.participants.find(
        (entry) => entry.socketId === socket.id
      );

      if (participant) {
        room.participants = room.participants.filter(
          (entry) => entry.socketId !== socket.id
        );
        emitParticipants(room.roomId);
        emitSystemMessage(
          room.roomId,
          `${participant.userName} left the live room`
        );
      }

      return room.participants.length > 0;
    });
  });
});

server.listen(Port, () => {
  console.log(`listening on *:${Port}`);
});
