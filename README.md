# RealTimeBoard

RealTimeBoard is a collaborative whiteboard for quick visual brainstorming. It lets people spin up a room, share a link, draw together in real time, chat inside the session, and keep boards synced to Firestore for later access.

Unlike the previous README, this project is not a Next.js app. It is a lightweight static frontend in `public/` served by an Express + Socket.IO backend in `server/`.

## Features

- Real-time room-based collaboration with shareable `/room/:roomId` URLs
- Live drawing sync over Socket.IO
- Built-in room chat for collaborators
- Drawing tools: pencil, eraser, line, rectangle, and circle
- Undo, redo, stroke-width control, and color picker
- Canvas background switching
- Local export/import with `.rtb` drawing files
- Google sign-in with Firebase Authentication
- Firestore-backed cloud restore and drawing history
- Rename and delete saved drawings from the sidebar

## Tech Stack

- Frontend: HTML, CSS, vanilla JavaScript, Tailwind via CDN, Rough.js
- Backend: Node.js, Express, Socket.IO
- Realtime transport: WebSockets via Socket.IO
- Persistence: Firebase Authentication + Cloud Firestore
- Deployment configs included for: Render, Vercel, and Firebase Hosting

## Project Structure

```text
RealTimeBoard/
├── public/
│   ├── app.js          # Whiteboard, room, chat, and sidebar logic
│   ├── index.html      # Landing page, room UI, Firebase setup
│   ├── manifest.json   # PWA metadata
│   └── styles.css      # App styles
├── server/
│   ├── .env            # Local server port
│   └── index.js        # Express + Socket.IO server
├── firebase.json       # Firebase Hosting config
├── render.yaml         # Render deployment config
├── vercel.json         # Vercel static hosting config
└── package.json
```

## How It Works

1. The Express server serves the static app from `public/`.
2. Visiting `/room/:roomId` loads the same frontend and opens a dedicated whiteboard room.
3. When live mode is enabled, the client connects to the Socket.IO server and syncs canvas updates plus chat messages with everyone in the room.
4. Firestore stores the latest room snapshot so signed-in users can restore boards and browse their drawing history.

## Getting Started

### Prerequisites

- Node.js 18+ recommended
- npm
- A Firebase project if you want your own auth and Firestore backend

### Install

```bash
npm install
```

### Local Environment

The server reads its port from `server/.env`:

```env
PORT=5001
```

That file already exists in this repo. If you want a different port, update it there.

### Start the App

For development:

```bash
npm run dev
```

For production-style local run:

```bash
npm start
```

Then open:

```text
http://localhost:5001
```

## Firebase Setup

Firebase is initialized directly in [public/index.html](/Users/debanjanmaity/Documents/RealTimeBoard/public/index.html). If you are forking or deploying your own instance, replace the existing config with your own Firebase project values.

You will need:

- Firebase Authentication with Google sign-in enabled
- Cloud Firestore enabled
- A `rooms` collection for saved boards

### Important Firestore Note

The drawing history query filters by `ownerId` and sorts by `updatedAt`, which typically requires a composite index in Firestore.

Create an index similar to:

- Collection: `rooms`
- Fields: `ownerId` ascending, `updatedAt` descending

If the sidebar history shows a sync/index error, this is the first thing to check.

## Configuration Notes

### Realtime Server URL

The frontend chooses the Socket.IO server URL in [public/app.js](/Users/debanjanmaity/Documents/RealTimeBoard/public/app.js):

- `http://localhost:5001` when running locally
- `https://whiteboard-real-time-one.onrender.com` for non-local environments

If you deploy your own backend, update that fallback value.

### Live Collaboration

Live sync only starts when a room is opened in live mode, which uses a URL like:

```text
/room/<roomId>?live=true
```

The room modal generates this link automatically.

## Available Scripts

```bash
npm start    # Run the Express server
npm run dev  # Run the server with nodemon
npm run build
```

`npm run build` is currently a placeholder because the app does not have a bundling/build step.

## Deployment

This repo includes a few deployment paths:

- Render: `render.yaml` runs the Node server with `npm start`
- Vercel: `vercel.json` serves the static frontend from `public/`
- Firebase Hosting: `firebase.json` rewrites routes to `index.html`

### Important Deployment Caveat

If you deploy only the static frontend to Vercel or Firebase Hosting, realtime collaboration still depends on a running Socket.IO backend. In the current codebase, production clients connect to the Render backend URL defined in `public/app.js`.

## Current Limitations

- Firebase config is embedded in the client rather than injected from environment variables
- Room state stored in the Node server is in-memory and is cleared when the backend restarts
- The server does not currently persist chat history
- There is no automated test suite yet
- `manifest.json` references `icon.png`, but that asset is not present in `public/`

## Roadmap Ideas

- Environment-based runtime configuration
- Persistent backend room state beyond Firestore snapshots
- Better presence indicators and collaborator cursors
- More shapes and editing tools
- Session permissions and private rooms
- Automated tests for server events and canvas state handling

## License

This project is licensed under the [MIT License](/Users/debanjanmaity/Documents/RealTimeBoard/LICENSE).
