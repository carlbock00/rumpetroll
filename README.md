# Rumpetroll

A massive-multiplayer experiment built with WebSockets and HTML5 Canvas. Real-time, browser-based multiplayer interactions with fluid, responsive gameplay.

## Features

- **Real-time multiplayer**: Powered by Socket.IO for low-latency communication
- **Tadpole aesthetics**: Cute tadpole characters with wiggling animated tails
- **Click-to-swim navigation**: Click anywhere to swim there, or use keyboard controls
- **Infinite world**: Limitless space to explore with no boundaries
- **Camera follow**: Smooth camera that keeps your tadpole centered
- **Swimming animation**: Realistic tail wiggling that adapts to movement speed
- **HTML5 Canvas rendering**: High-performance graphics with water effects
- **Persistent state**: Player data saved to JSON files
- **Customizable names**: Players can set their own names
- **Colorful tadpoles**: Each player gets a unique color

## Tech Stack

- **Backend**: Node.js + Express + Socket.IO
- **Frontend**: Vanilla JavaScript + HTML5 Canvas
- **Storage**: Simple JSON file persistence
- **Real-time**: WebSocket connections

## Setup

### Prerequisites

- Node.js (v14 or higher)
- npm

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

Or for development with auto-reload:
```bash
npm run dev
```

3. Open your browser and navigate to:
```
http://localhost:3000
```

## How to Play

- **Click anywhere** on the canvas to swim there
- Use **Arrow Keys** or **WASD** for keyboard control (optional)
- Type in the name input field to set your custom name
- Watch other tadpoles swim around in real-time
- Explore the infinite water world
- Player positions are automatically saved every 30 seconds

## Architecture

### Server (server.js)
- Express server serving static files
- Socket.IO handling real-time connections
- In-memory player state with JSON file persistence
- Auto-save mechanism (30-second intervals)
- Graceful shutdown handling

### Client (public/game.js)
- Canvas rendering with 60 FPS game loop
- Client-side prediction for own player
- Interpolation for other players (smooth movement)
- Throttled position updates to reduce network traffic
- Click-to-move and keyboard input handling
- Camera system following the player
- Tadpole rendering with animated tails

### Key Features for Fluid Performance

1. **Client-side interpolation**: Other players' positions are smoothly interpolated between server updates
2. **Client-side prediction**: Your own movement is instant without waiting for server confirmation
3. **Update throttling**: Position updates sent to server max every 50ms to reduce bandwidth
4. **Optimized rendering**: Using requestAnimationFrame for smooth 60 FPS rendering
5. **Velocity-based movement**: Physics-based movement with friction for natural feel
6. **Camera smoothing**: Smooth camera follow with interpolation
7. **Infinite world rendering**: Only visible water ripples are rendered for performance
8. **Adaptive tail animation**: Tail wiggle speed and intensity adapt to movement speed

## Customization

### Change server port
Set the `PORT` environment variable:
```bash
PORT=8080 npm start
```

### Adjust game parameters
Edit `public/game.js`:
- `MOVE_SPEED`: Higher = faster tadpole acceleration (default: 1.5)
- `FRICTION`: Lower = more sliding movement (default: 0.92)
- `CAMERA_SMOOTHING`: Higher = faster camera follow (default: 0.1)
- `TAIL_SEGMENTS`: More segments = smoother tail (default: 8)
- `TAIL_LENGTH`: Longer tails for your tadpoles (default: 60)
- `ARRIVAL_THRESHOLD`: How close to click target before stopping (default: 5)

### Player colors
Edit `server.js` to modify the `colors` array in the `randomColor` function

## File Structure

```
rumpetroll/
├── server.js           # Node.js server
├── package.json        # Dependencies
├── players.json        # Player data (auto-generated)
├── public/
│   ├── index.html     # Main HTML
│   ├── style.css      # Styles
│   └── game.js        # Client-side game logic
└── README.md          # This file
```

## License

MIT
