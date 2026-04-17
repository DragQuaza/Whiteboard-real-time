# RealTimeBoard 🎨

**🚀 Live Demo:** [https://realtimeboard-lovat.vercel.app/](https://realtimeboard-lovat.vercel.app/)

RealTimeBoard is a fast, collaborative whiteboard built for quick visual brainstorming. Spin up a room, share the link, and start drawing with your team instantly. Guests can jump right into the canvas friction-free without needing an account.

## Features

- **Live Collaboration:** Draw and chat with anyone in real time via WebSockets.
- **Tools:** Pencil, eraser, lines, shapes, and customizable stroke width/colors.
- **Cloud Sync:** Canvases auto-save to Firebase, so you never lose your work.
- **Frictionless Entry:** Anyone with the link can join the live room instantly as a guest.
- **Export:** Save your masterpiece locally as a crisp image or PDF.

## Tech Stack

- **Frontend:** Vanilla HTML/JS, Tailwind CSS, Rough.js
- **Backend:** Node.js, Socket.IO
- **Database:** Firebase/Firestore

## Running it Locally

You'll need Node.js installed on your machine. 

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the local server:**
   ```bash
   npm run dev
   ```

3. Open your browser and go to `http://localhost:5001`.

*Note: For cloud syncing to work perfectly in your local environment, you will need to add your Firebase configuration variables in a `server/.env` file.*

## Deployment Setup

The live app is split to handle WebSockets efficiently:
- **Frontend UI:** Hosted on [Vercel](https://realtimeboard-lovat.vercel.app/)
- **WebSocket Backend:** Hosted on [Render](https://whiteboard-real-time-1.onrender.com)

---
*Built with ❤️ for teams and thinkers by Debanjan Maity.*
