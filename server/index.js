const express = require("express");
const cors = require("cors");
const http = require("http");
const path = require("path");
const app = express();
let dotenv = require("dotenv");
dotenv.config();

const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

app.use(cors());
app.use(express.static(path.join(__dirname, "../public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.get("/room/:roomId", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

let rooms = [];
const Port = process.env.PORT || 5001;

io.on("connection", (socket) => {
  console.log("a user connected");
  // Join Room
  socket.on("joinRoom", (data) => {
    console.log("joined room", data.roomId);
    socket.join(data.roomId);
    const elements = rooms.find((element) => element.roomId === data.roomId);
    if (elements) {
      // uppdate the new user with the current canvas
      io.to(socket.id).emit("updateCanvas", elements);
      elements.user = [...elements.user, socket.id];
    } else {
      rooms.push({
        roomId: data.roomId,
        updatedElements: [],
        user: [socket.id],
        canvasColor: "#121212",
      });
    }
  });
  // update the canvas
  socket.on("updateCanvas", (data) => {
    // Broadcast the updated elements to all connected clients
    socket.to(data.roomId).emit("updateCanvas", data);
    const elements = rooms.find((element) => element.roomId === data.roomId);
    if (elements) {
      elements.updatedElements = data.updatedElements;
      elements.canvasColor = data.canvasColor;
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
    rooms.forEach((element) => {
      element.user = element.user.filter((user) => user !== socket.id);
      if (element.user.length === 0) {
        rooms = rooms.filter((room) => room.roomId !== element.roomId);
      }
    });
    // console.log(rooms);
  });
});

server.listen(Port, () => {
  console.log(`listening on *:${Port}`);
});
