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

const alasql = require('alasql');

alasql("CREATE TABLE IF NOT EXISTS templates (id INT, name STRING, elements_json STRING)");

const count = alasql("SELECT COUNT(*) as c FROM templates")[0].c;
if (count === 0) {
    const kanbanJson = JSON.stringify([
      { element: "rect", offsetX: 100, offsetY: 100, width: 800, height: 600, stroke: "#ffffff", strokeWidth: 2, roughness: 1, id: "k1" },
      { element: "line", offsetX: 366, offsetY: 100, width: 366, height: 700, stroke: "#ffffff", strokeWidth: 2, roughness: 1, id: "k2" },
      { element: "line", offsetX: 633, offsetY: 100, width: 633, height: 700, stroke: "#ffffff", strokeWidth: 2, roughness: 1, id: "k3" },
      { element: "line", offsetX: 100, offsetY: 160, width: 900, height: 160, stroke: "#ffffff", strokeWidth: 2, roughness: 1, id: "k4" }
    ]);
    const wireframeJson = JSON.stringify([
      { element: "rect", offsetX: 400, offsetY: 50, width: 300, height: 600, stroke: "#ffffff", strokeWidth: 2, roughness: 1, id: "w1", radius: 20 },
      { element: "rect", offsetX: 420, offsetY: 80, width: 260, height: 200, stroke: "#ffffff", strokeWidth: 2, roughness: 1, id: "w2" },
      { element: "circle", offsetX: 550, offsetY: 600, width: 40, height: 40, stroke: "#ffffff", strokeWidth: 2, roughness: 1, id: "w3" }
    ]);
    const mindmapJson = JSON.stringify([
      { element: "line", offsetX: 500, offsetY: 400, width: 390, height: 260, stroke: "#CCFF00", strokeWidth: 2, roughness: 1, id: "cl1" },
      { element: "line", offsetX: 500, offsetY: 400, width: 390, height: 500, stroke: "#CCFF00", strokeWidth: 2, roughness: 1, id: "cl2" },
      { element: "line", offsetX: 720, offsetY: 400, width: 820, height: 260, stroke: "#CCFF00", strokeWidth: 2, roughness: 1, id: "cl3" },
      { element: "line", offsetX: 720, offsetY: 400, width: 820, height: 500, stroke: "#CCFF00", strokeWidth: 2, roughness: 1, id: "cl4" },

      { element: "rect", offsetX: 500, offsetY: 350, width: 220, height: 100, stroke: "#CCFF00", strokeWidth: 4, roughness: 1, id: "center_rect", radius: 10 },

      { element: "rect", offsetX: 250, offsetY: 240, width: 140, height: 40, stroke: "#CCFF00", strokeWidth: 2, roughness: 1, id: "plan_rect" },
      
      { element: "rect", offsetX: 250, offsetY: 480, width: 140, height: 40, stroke: "#CCFF00", strokeWidth: 2, roughness: 1, id: "mark_rect" },

      { element: "rect", offsetX: 820, offsetY: 240, width: 140, height: 40, stroke: "#CCFF00", strokeWidth: 2, roughness: 1, id: "exec_rect" },

      { element: "rect", offsetX: 820, offsetY: 480, width: 160, height: 40, stroke: "#CCFF00", strokeWidth: 2, roughness: 1, id: "risk_rect" },

      { element: "line", offsetX: 250, offsetY: 260, width: 150, height: 210, stroke: "#888888", strokeWidth: 1.5, roughness: 0, id: "pl1" },
      { element: "line", offsetX: 250, offsetY: 260, width: 150, height: 270, stroke: "#888888", strokeWidth: 1.5, roughness: 0, id: "pl2" },
      { element: "line", offsetX: 250, offsetY: 260, width: 150, height: 330, stroke: "#888888", strokeWidth: 1.5, roughness: 0, id: "pl3" },

      { element: "rect", offsetX: 50, offsetY: 195, width: 100, height: 30, stroke: "#ffffff", strokeWidth: 1, roughness: 1, id: "pr1" },
      { element: "rect", offsetX: 50, offsetY: 255, width: 100, height: 30, stroke: "#ffffff", strokeWidth: 1, roughness: 1, id: "pr2" },
      { element: "rect", offsetX: 50, offsetY: 315, width: 100, height: 30, stroke: "#ffffff", strokeWidth: 1, roughness: 1, id: "pr3" },

      { element: "line", offsetX: 960, offsetY: 260, width: 1060, height: 210, stroke: "#888888", strokeWidth: 1.5, roughness: 0, id: "el1" },
      { element: "line", offsetX: 960, offsetY: 260, width: 1060, height: 270, stroke: "#888888", strokeWidth: 1.5, roughness: 0, id: "el2" },

      { element: "rect", offsetX: 1060, offsetY: 195, width: 110, height: 30, stroke: "#ffffff", strokeWidth: 1, roughness: 1, id: "er1" },
      { element: "rect", offsetX: 1060, offsetY: 255, width: 110, height: 30, stroke: "#ffffff", strokeWidth: 1, roughness: 1, id: "er2" }
    ]);

    alasql("INSERT INTO templates VALUES (1, 'Kanban Board', ?), (2, 'Mobile Wireframe', ?), (3, 'Mind Map', ?)", [kanbanJson, wireframeJson, mindmapJson]);
}

app.use(express.json());

app.get('/api/templates', (req, res) => {
  try {
    const rows = alasql('SELECT id, name, elements_json FROM templates ORDER BY id ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({error: err.message});
  }
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
