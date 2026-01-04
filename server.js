const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'players.json');

// Serve static files
app.use(express.static('public'));

// In-memory player storage
let players = {};

// Food storage
let food = {};
let foodIdCounter = 0;

// Generate food in random locations
function generateFood(count) {
  for (let i = 0; i < count; i++) {
    const id = `food_${foodIdCounter++}`;

    // Spread across 4000x4000 area
    const x = (Math.random() - 0.5) * 4000;
    const y = (Math.random() - 0.5) * 4000;

    // Varying size: 75-125% of base radius (4)
    const baseRadius = 4;
    const sizeVariation = 0.75 + Math.random() * 0.5; // 0.75 to 1.25
    const radius = baseRadius * sizeVariation;

    food[id] = {
      id,
      x,
      y,
      radius
    };
  }
}

// Clear all existing food and initialize with extremely sparse food - 10% of previous amount
// 4000x4000 world = 16 areas of 1000x1000, so ~1-2 food items total
food = {}; // Clear all existing food
foodIdCounter = 0; // Reset counter
generateFood(2);

// Load players from JSON file
async function loadPlayers() {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf8');
    players = JSON.parse(data);
    console.log('Players loaded from file');
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('No existing player data found, starting fresh');
      players = {};
    } else {
      console.error('Error loading players:', error);
    }
  }
}

// Save players to JSON file
async function savePlayers() {
  try {
    await fs.writeFile(DATA_FILE, JSON.stringify(players, null, 2));
  } catch (error) {
    console.error('Error saving players:', error);
  }
}

// Auto-save every 30 seconds
setInterval(savePlayers, 30000);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('New player connected:', socket.id);

  // Generate color for new player - all white tadpoles
  const randomColor = () => {
    return '#FFFFFF';
  };

  // Initialize player
  players[socket.id] = {
    id: socket.id,
    x: Math.random() * 1200,
    y: Math.random() * 800,
    vx: 0,
    vy: 0,
    color: randomColor(),
    radius: 8,
    score: 0,
    name: `Player${Math.floor(Math.random() * 1000)}`,
    lastMoveTime: Date.now(),
    isIdle: false,
    type: 'tadpole' // Default to tadpole
  };

  // Send current player their data
  socket.emit('init', {
    id: socket.id,
    player: players[socket.id]
  });

  // Send all players to new connection
  socket.emit('players', players);

  // Send all food to new connection
  socket.emit('food', food);

  // Broadcast new player to all other clients
  socket.broadcast.emit('playerJoined', players[socket.id]);

  // Handle player movement
  socket.on('move', (data) => {
    // If player was converted to NPC, re-add them to players
    if (!players[socket.id]) {
      console.log(`Player ${socket.id} became active again, re-adding to players`);
      players[socket.id] = {
        id: socket.id,
        x: data.x,
        y: data.y,
        vx: data.vx,
        vy: data.vy,
        color: '#FFFFFF',
        radius: 8,
        score: 0,
        name: `Player${Math.floor(Math.random() * 1000)}`,
        lastMoveTime: Date.now(),
        isIdle: false,
        type: data.type || 'tadpole'
      };
      // Notify all clients this player is active again
      io.emit('playerActive', { id: socket.id });
      // Broadcast player joined
      socket.broadcast.emit('playerJoined', players[socket.id]);
    } else {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      players[socket.id].vx = data.vx;
      players[socket.id].vy = data.vy;
      players[socket.id].lastMoveTime = Date.now();

      // If player was marked inactive, clear that
      if (players[socket.id].isInactive) {
        players[socket.id].isInactive = false;
        players[socket.id].inactiveTime = null;
      }

      // Broadcast to all other clients
      socket.broadcast.emit('playerMoved', {
        id: socket.id,
        x: data.x,
        y: data.y,
        vx: data.vx,
        vy: data.vy
      });
    }
  });

  // Handle player name change
  socket.on('setName', (name) => {
    if (players[socket.id]) {
      players[socket.id].name = name.substring(0, 20); // Limit name length
      io.emit('playerUpdated', players[socket.id]);
    }
  });

  // Handle food eating
  socket.on('eatFood', (foodId) => {
    if (food[foodId] && players[socket.id]) {
      // Remove the food
      delete food[foodId];

      // Increase player score
      players[socket.id].score += 1;

      // Broadcast food removal to all clients
      io.emit('foodEaten', { foodId, playerId: socket.id, score: players[socket.id].score });

      // Spawn new food to replace it
      generateFood(1);

      // Send new food to all clients
      const newFoodId = `food_${foodIdCounter - 1}`;
      io.emit('foodSpawned', food[newFoodId]);
    }
  });

  // Handle death food spawning
  socket.on('spawnDeathFood', (data) => {
    // Spawn variable number of food items based on entity type
    const foodCount = data.count || 5; // Default to 5 if not specified

    for (let i = 0; i < foodCount; i++) {
      const id = `food_${foodIdCounter++}`;
      const angle = (Math.PI * 2 / foodCount) * i;
      const dist = 20 + Math.random() * 20;

      // Varying size: 75-125% of base radius (4)
      const baseRadius = 4;
      const sizeVariation = 0.75 + Math.random() * 0.5; // 0.75 to 1.25
      const radius = baseRadius * sizeVariation;

      food[id] = {
        id,
        x: data.x + Math.cos(angle) * dist,
        y: data.y + Math.sin(angle) * dist,
        radius
      };

      // Broadcast new food to all clients
      io.emit('foodSpawned', food[id]);
    }
  });

  // Handle player becoming inactive (tab hidden)
  socket.on('playerInactive', () => {
    if (players[socket.id]) {
      players[socket.id].isInactive = true;
      players[socket.id].inactiveTime = Date.now();
      console.log(`Player ${socket.id} is now inactive (tab hidden)`);
    }
  });

  // Handle player becoming active again (tab visible)
  socket.on('playerActive', () => {
    // If player was converted to NPC, re-add them to players
    if (!players[socket.id]) {
      console.log(`Player ${socket.id} tab became visible, re-adding to players`);
      players[socket.id] = {
        id: socket.id,
        x: Math.random() * 1200,
        y: Math.random() * 800,
        vx: 0,
        vy: 0,
        color: '#FFFFFF',
        radius: 8,
        score: 0,
        name: `Player${Math.floor(Math.random() * 1000)}`,
        lastMoveTime: Date.now(),
        isIdle: false,
        isInactive: false,
        type: 'tadpole'
      };
      // Notify all clients this player is active again
      io.emit('playerActive', { id: socket.id });
      // Broadcast player joined
      socket.broadcast.emit('playerJoined', players[socket.id]);
    } else {
      players[socket.id].isInactive = false;
      players[socket.id].inactiveTime = null;
      console.log(`Player ${socket.id} is now active again (tab visible)`);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, saving players and shutting down...');
  await savePlayers();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, saving players and shutting down...');
  await savePlayers();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Periodically check and regenerate food to maintain density
setInterval(() => {
  const regionSize = 1000;
  const regions = {};

  // Count food in each region
  for (let foodId in food) {
    const foodItem = food[foodId];
    const rx = Math.floor(foodItem.x / regionSize);
    const ry = Math.floor(foodItem.y / regionSize);
    const key = `${rx},${ry}`;
    regions[key] = (regions[key] || 0) + 1;
  }

  // Check regions and spawn food where needed
  const minX = -2000;
  const maxX = 2000;
  const minY = -2000;
  const maxY = 2000;

  for (let x = minX; x < maxX; x += regionSize) {
    for (let y = minY; y < maxY; y += regionSize) {
      const rx = Math.floor(x / regionSize);
      const ry = Math.floor(y / regionSize);
      const key = `${rx},${ry}`;
      const count = regions[key] || 0;

      if (count === 0) {
        // 5% chance to spawn 1 food item in empty regions (10% of previous 50%)
        if (Math.random() < 0.05) {
          const id = `food_${foodIdCounter++}`;
          const fx = x + Math.random() * regionSize;
          const fy = y + Math.random() * regionSize;

          // Varying size: 75-125% of base radius (4)
          const baseRadius = 4;
          const sizeVariation = 0.75 + Math.random() * 0.5; // 0.75 to 1.25
          const radius = baseRadius * sizeVariation;

          food[id] = { id, x: fx, y: fy, radius };

          // Broadcast new food to all clients
          io.emit('foodSpawned', food[id]);
        }
      }
    }
  }
}, 5000); // Check every 5 seconds

// Check for idle players and convert them to NPCs
setInterval(() => {
  const now = Date.now();
  const idleTimeout = 5000; // 5 seconds of no movement (much faster detection)
  const inactiveTimeout = 3000; // 3 seconds with tab hidden

  for (let playerId in players) {
    const player = players[playerId];

    // Convert inactive players (tab hidden) to NPCs
    if (player.isInactive && player.inactiveTime && now - player.inactiveTime > inactiveTimeout) {
      console.log(`Converting inactive player ${playerId} to NPC (tab hidden)`);
      io.emit('playerIdle', {
        id: playerId,
        player: player
      });
      // Remove from players list to stop broadcasting their updates
      delete players[playerId];
    }
    // Also check for idle players based on no movement
    else if (!player.isIdle && !player.isInactive && now - player.lastMoveTime > idleTimeout) {
      // Player is idle, convert to NPC for all clients (emit only once)
      console.log(`Converting idle player ${playerId} (${player.name}) to NPC (no movement)`);
      io.emit('playerIdle', {
        id: playerId,
        player: player
      });
      // Remove from players list to stop broadcasting their updates
      delete players[playerId];
    }
  }
}, 2000); // Check every 2 seconds (faster checking)

// Start server
loadPlayers().then(() => {
  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);

    // Broadcast food reset to all connected clients (if any)
    io.emit('foodReset', food);
  });
});
