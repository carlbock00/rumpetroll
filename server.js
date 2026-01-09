const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const fs = require('fs').promises;
const path = require('path');
const session = require('express-session');
const crypto = require('crypto');

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

// Generate a secure session secret (or use environment variable)
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// Session middleware
const sessionMiddleware = session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
});

// JSON body parser
app.use(express.json());

// Apply session middleware
app.use(sessionMiddleware);

// Auth routes
const authRoutes = require('./auth');
app.use('/api/auth', authRoutes);

// Serve static files
app.use(express.static('public'));

// In-memory player storage
let players = {};

// Food storage
let food = {};
let foodIdCounter = 0;

// NPC storage and constants
let npcs = {};
let npcIdCounter = 0;

// NPC Constants (must match client)
const NPC_MOVE_SPEED = 0.034; // 20% slower top speed
const FRICTION = 0.988;
const ARRIVAL_THRESHOLD = 30;
const NPC_TADPOLE_RADIUS = 11.2;
const NPC_CELL_RADIUS = 40;
const NPC_TADPOLE_HEALTH = 80; // NPCs tankier than players
const NPC_CELL_HEALTH = 80; // 40% of original 200
const NPC_MAX_HEALTH = 100;
const NPC_HEALTH_REGEN_RATE = 0.015;
const ATTACK_DAMAGE = 14; // Player base damage (weak at start)
const NPC_TADPOLE_DAMAGE = 20; // NPCs hit harder than players
const NPC_CELL_DAMAGE = 20; // Competitive with facing behavior
const ATTACK_RANGE = 80;
const NPC_ATTACK_COOLDOWN = 700;
const CELL_DAMAGE_RESISTANCE = 0.6;

// Get spawn center based on active players
function getSpawnCenter() {
  const activePlayers = Object.values(players).filter(p => !p.isInactive && !p.isIdle);
  if (activePlayers.length === 0) {
    return { x: 0, y: 0 };
  }
  // Return center of all active players
  const sumX = activePlayers.reduce((sum, p) => sum + p.x, 0);
  const sumY = activePlayers.reduce((sum, p) => sum + p.y, 0);
  return { x: sumX / activePlayers.length, y: sumY / activePlayers.length };
}

// Spawn radius for NPCs and food around players
const SPAWN_RADIUS = 1200;
const DESPAWN_RADIUS = 1800;
const CELL_MIN_DIST_FROM_PLAYERS = 600;

// Initialize NPCs around spawn center
function initializeNPCs() {
  npcs = {};
  const totalNPCs = 9; // 3 cells + 6 tadpoles
  const npcCellCount = 3;
  const center = getSpawnCenter();
  const activePlayers = Object.values(players).filter(p => !p.isInactive && !p.isIdle);

  for (let i = 0; i < totalNPCs; i++) {
    const isCell = i < npcCellCount;
    const id = `npc_${npcIdCounter++}`;

    let spawnX, spawnY;
    let attempts = 0;
    const maxAttempts = 50;

    do {
      // Spawn at random position within spawn radius of center
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * SPAWN_RADIUS;
      spawnX = center.x + Math.cos(angle) * dist;
      spawnY = center.y + Math.sin(angle) * dist;
      attempts++;

      // For cells, ensure minimum distance from all players
      if (isCell && activePlayers.length > 0) {
        let tooClose = false;
        for (let player of activePlayers) {
          const dx = spawnX - player.x;
          const dy = spawnY - player.y;
          if (Math.sqrt(dx * dx + dy * dy) < CELL_MIN_DIST_FROM_PLAYERS) {
            tooClose = true;
            break;
          }
        }
        if (tooClose && attempts < maxAttempts) continue;
      }
      break;
    } while (attempts < maxAttempts);

    npcs[id] = {
      id,
      x: spawnX,
      y: spawnY,
      vx: 0,
      vy: 0,
      color: '#505050',
      radius: isCell ? NPC_CELL_RADIUS : NPC_TADPOLE_RADIUS,
      health: isCell ? NPC_CELL_HEALTH : NPC_TADPOLE_HEALTH,
      maxHealth: isCell ? NPC_CELL_HEALTH : NPC_TADPOLE_HEALTH,
      lastHit: 0,
      lastAttack: 0,
      type: isCell ? 'cell' : 'tadpole',
      moveTarget: null,
      targetChangeTime: 0,
      provoked: false,
      provokedBy: null,
      attackTarget: null,
      // Cell fatigue
      chaseEnergy: 100,
      maxChaseEnergy: 100,
      isTired: false,
      tiredStartTime: 0,
      // Animation state (for client)
      attackLungeTime: 0,
      attackLungeAngle: 0
    };
  }
  console.log(`Initialized ${totalNPCs} NPCs (${npcCellCount} cells, ${totalNPCs - npcCellCount} tadpoles)`);
}

// Update single NPC behavior
function updateNPC(npc) {
  const now = Date.now();

  // Random wandering movement
  if (!npc.moveTarget || now - npc.targetChangeTime > 3000) {
    npc.moveTarget = {
      x: npc.x + (Math.random() - 0.5) * 400,
      y: npc.y + (Math.random() - 0.5) * 400
    };
    npc.targetChangeTime = now;
  }

  // Move towards target (when not chasing a player)
  let isChasing = false;

  // Cell fatigue system
  if (npc.type === 'cell') {
    if (npc.isTired) {
      const restTime = now - npc.tiredStartTime;
      const restDuration = 4000;
      npc.chaseEnergy = Math.min(npc.maxChaseEnergy, (restTime / restDuration) * npc.maxChaseEnergy);
      if (npc.chaseEnergy >= npc.maxChaseEnergy) {
        npc.isTired = false;
        npc.chaseEnergy = npc.maxChaseEnergy;
      }
    }
  }

  // Check for nearby players to chase/attack
  for (let playerId in players) {
    const player = players[playerId];
    if (!player) continue;
    // Skip inactive players
    if (player.isInactive) continue;

    const dx = npc.x - player.x;
    const dy = npc.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Cells only attack smaller creatures (tadpoles), not other cells
    const playerType = player.type || 'tadpole';
    const cellCanChase = npc.type === 'cell' && !npc.isTired && playerType !== 'cell';
    const isAggressive = npc.provoked || cellCanChase;
    const spotRange = npc.type === 'cell' ? 400 : 300;

    if (isAggressive && dist < spotRange) {
      isChasing = true;

      // Chase the player
      if (dist > ATTACK_RANGE * 0.8) {
        const chaseAngle = Math.atan2(-dy, -dx);

        let chaseSpeed;
        if (npc.type === 'cell') {
          // Cells can sprint (2x speed) while they have energy
          const isSprinting = npc.chaseEnergy > 0;
          chaseSpeed = NPC_MOVE_SPEED * (isSprinting ? 1.6 : 0.5); // Sprint or exhausted crawl
          npc.isSprinting = isSprinting;

          // Deplete energy faster while sprinting
          npc.chaseEnergy -= 1.5;
          if (npc.chaseEnergy <= 0) {
            npc.isTired = true;
            npc.tiredStartTime = now;
            npc.chaseEnergy = 0;
          }
        } else {
          // NPC tadpoles move at same speed as player tadpoles
          chaseSpeed = NPC_MOVE_SPEED;
        }

        npc.vx += Math.cos(chaseAngle) * chaseSpeed;
        npc.vy += Math.sin(chaseAngle) * chaseSpeed;
      }

      // Attack when in range (skip if player has bubble shield active)
      if (dist < ATTACK_RANGE && now - npc.lastAttack > NPC_ATTACK_COOLDOWN && !player.bubbleShieldActive) {
        const baseDamage = npc.type === 'cell' ? NPC_CELL_DAMAGE : NPC_TADPOLE_DAMAGE;
        const actualDamage = baseDamage * (playerType === 'cell' ? CELL_DAMAGE_RESISTANCE : 1);

        npc.lastAttack = now;
        npc.attackLungeTime = now;
        npc.attackLungeAngle = Math.atan2(-dy, -dx);

        // Send damage event to the specific player
        const playerSocket = io.sockets.sockets.get(playerId);
        if (playerSocket) {
          playerSocket.emit('npcAttack', {
            npcId: npc.id,
            damage: actualDamage,
            knockbackX: -Math.cos(npc.attackLungeAngle) * 0.5,
            knockbackY: -Math.sin(npc.attackLungeAngle) * 0.5
          });
        }
      }

      // Tadpoles clear provoked state after 8 seconds
      if (npc.type !== 'cell' && now - npc.lastHit > 8000 && now - npc.lastAttack > 8000) {
        npc.provoked = false;
        npc.provokedBy = null;
      }
    } else if (!isAggressive && dist < 100 && npc.type === 'tadpole') {
      // Peaceful tadpoles avoid players
      const avoidAngle = Math.atan2(dy, dx);
      npc.vx += Math.cos(avoidAngle) * 0.015;
      npc.vy += Math.sin(avoidAngle) * 0.015;
    }
  }

  // Reset sprinting when not chasing
  if (!isChasing && npc.type === 'cell') {
    npc.isSprinting = false;
  }

  // NPC cells seek and collect food when not chasing players
  let isSeekingFood = false;
  if (!isChasing && npc.type === 'cell') {
    // Find nearest food within detection range
    const FOOD_DETECTION_RANGE = 250;
    let nearestFood = null;
    let nearestFoodDist = Infinity;

    for (let foodId in food) {
      const foodItem = food[foodId];
      const dx = foodItem.x - npc.x;
      const dy = foodItem.y - npc.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < FOOD_DETECTION_RANGE && dist < nearestFoodDist) {
        nearestFood = foodItem;
        nearestFoodDist = dist;
      }
    }

    if (nearestFood) {
      isSeekingFood = true;

      // Check if close enough to eat
      const eatRange = npc.radius + nearestFood.radius;
      if (nearestFoodDist < eatRange) {
        // Eat the food
        io.emit('foodEaten', { foodId: nearestFood.id });
        delete food[nearestFood.id];
        // Cells don't need the food value, they just collect it
      } else {
        // Move towards food
        const dx = nearestFood.x - npc.x;
        const dy = nearestFood.y - npc.y;
        const moveSpeed = NPC_MOVE_SPEED * 0.5; // Moderate speed when seeking food
        npc.vx += (dx / nearestFoodDist) * moveSpeed;
        npc.vy += (dy / nearestFoodDist) * moveSpeed;
      }
    }
  }

  // Wander if not chasing and not seeking food
  if (!isChasing && !isSeekingFood && npc.moveTarget) {
    const dx = npc.moveTarget.x - npc.x;
    const dy = npc.moveTarget.y - npc.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < ARRIVAL_THRESHOLD) {
      npc.moveTarget = null;
      npc.vx *= 0.985;
      npc.vy *= 0.985;
    } else {
      // Cells wander slowly, tadpoles at normal speed
      let moveSpeed = npc.type === 'cell' ? NPC_MOVE_SPEED * 0.35 : NPC_MOVE_SPEED;
      const decelerationZone = ARRIVAL_THRESHOLD * 2;
      if (dist < decelerationZone) {
        const speedMultiplier = 0.5 + 0.5 * (dist - ARRIVAL_THRESHOLD) / (decelerationZone - ARRIVAL_THRESHOLD);
        moveSpeed *= speedMultiplier;
      }
      npc.vx += (dx / dist) * moveSpeed;
      npc.vy += (dy / dist) * moveSpeed;
    }
  }

  // NPC vs NPC combat (rare)
  // Cells only attack tadpoles, not other cells
  if (!npc.attackTarget && Math.random() < 0.001) {
    const nearbyNPCs = Object.values(npcs).filter(other => {
      if (other.id === npc.id) return false;
      // Cells only target tadpoles, not other cells
      if (npc.type === 'cell' && other.type === 'cell') return false;
      const dx = other.x - npc.x;
      const dy = other.y - npc.y;
      return Math.sqrt(dx * dx + dy * dy) < 200;
    });
    if (nearbyNPCs.length > 0) {
      npc.attackTarget = nearbyNPCs[Math.floor(Math.random() * nearbyNPCs.length)].id;
    }
  }

  // Attack another NPC
  if (npc.attackTarget) {
    const target = npcs[npc.attackTarget];
    if (target && target.health > 0) {
      const dx = target.x - npc.x;
      const dy = target.y - npc.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > ATTACK_RANGE) {
        npc.vx += (dx / dist) * NPC_MOVE_SPEED * 0.5;
        npc.vy += (dy / dist) * NPC_MOVE_SPEED * 0.5;
      }

      if (dist < ATTACK_RANGE && now - npc.lastAttack > NPC_ATTACK_COOLDOWN) {
        const npcDamage = ATTACK_DAMAGE * (npc.type === 'cell' ? 1.5 : 1);
        const actualDamage = npcDamage * (target.type === 'cell' ? CELL_DAMAGE_RESISTANCE : 1);
        target.health -= actualDamage;
        target.lastHit = now;
        npc.lastAttack = now;
        npc.attackLungeTime = now;
        npc.attackLungeAngle = Math.atan2(dy, dx);

        target.vx += Math.cos(npc.attackLungeAngle) * 1;
        target.vy += Math.sin(npc.attackLungeAngle) * 1;

        if (target.health <= 0) {
          handleNPCDeath(target);
          npc.attackTarget = null;
        }
      }
    } else {
      npc.attackTarget = null;
    }
  }

  // Collision with other NPCs
  for (let otherId in npcs) {
    if (otherId === npc.id) continue;
    const other = npcs[otherId];
    const dx = npc.x - other.x;
    const dy = npc.y - other.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const minDistance = npc.radius + other.radius;

    if (distance < minDistance && distance > 0) {
      const angle = Math.atan2(dy, dx);
      const overlap = minDistance - distance;
      npc.x += Math.cos(angle) * overlap * 0.5;
      npc.y += Math.sin(angle) * overlap * 0.5;
      npc.vx += Math.cos(angle) * 0.3;
      npc.vy += Math.sin(angle) * 0.3;
    }
  }

  // Collision with players
  for (let playerId in players) {
    const player = players[playerId];
    if (!player) continue;
    const dx = npc.x - player.x;
    const dy = npc.y - player.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const playerRadius = player.radius || 8;
    const minDistance = npc.radius + playerRadius;

    if (distance < minDistance && distance > 0) {
      const angle = Math.atan2(dy, dx);
      const overlap = minDistance - distance;
      npc.x += Math.cos(angle) * overlap * 0.5;
      npc.y += Math.sin(angle) * overlap * 0.5;
      npc.vx += Math.cos(angle) * 0.3;
      npc.vy += Math.sin(angle) * 0.3;
    }
  }

  // Apply friction
  npc.vx *= FRICTION;
  npc.vy *= FRICTION;
  if (Math.abs(npc.vx) < 0.01) npc.vx = 0;
  if (Math.abs(npc.vy) < 0.01) npc.vy = 0;

  // Update position
  npc.x += npc.vx;
  npc.y += npc.vy;

  // Health regeneration
  if (now - npc.lastHit > 1000) {
    npc.health = Math.min(npc.maxHealth, npc.health + NPC_HEALTH_REGEN_RATE);
  }
}

// Handle NPC death
function handleNPCDeath(npc) {
  const deathX = npc.x;
  const deathY = npc.y;
  const wasCell = npc.type === 'cell';

  // Cells drop 1 rare Essence + 3-5 Plankton
  // Tadpoles drop only 2-5 Plankton
  const planktonCount = wasCell
    ? 3 + Math.floor(Math.random() * 3)   // Cells: 3-5 plankton
    : 2 + Math.floor(Math.random() * 4);  // Tadpoles: 2-5 plankton

  // Spawn nucleotide first (only from cells)
  if (wasCell) {
    const nucleotideId = `food_${foodIdCounter++}`;
    const nucleotideAngle = Math.random() * Math.PI * 2;
    const nucleotideDist = 15 + Math.random() * 10;

    food[nucleotideId] = {
      id: nucleotideId,
      x: deathX + Math.cos(nucleotideAngle) * nucleotideDist,
      y: deathY + Math.sin(nucleotideAngle) * nucleotideDist,
      radius: 6, // Slightly larger than food
      type: 'nucleotide', // Rare currency from cells, needed for evolution
      spawnTime: Date.now(),
      ttl: 90000 + Math.random() * 90000 // 90-180 seconds lifespan (longer)
    };
    io.emit('foodSpawned', food[nucleotideId]);
  }

  // Spawn plankton
  for (let i = 0; i < planktonCount; i++) {
    const id = `food_${foodIdCounter++}`;
    const angle = (Math.PI * 2 / planktonCount) * i + (wasCell ? 0.5 : 0);
    const dist = 20 + Math.random() * 20;
    const baseRadius = 4;
    const sizeVariation = 0.75 + Math.random() * 0.5;

    food[id] = {
      id,
      x: deathX + Math.cos(angle) * dist,
      y: deathY + Math.sin(angle) * dist,
      radius: baseRadius * sizeVariation,
      type: 'plankton',
      spawnTime: Date.now(),
      ttl: 30000 + Math.random() * 60000 // 30-90 seconds lifespan
    };
    io.emit('foodSpawned', food[id]);
  }

  // Broadcast death effect
  io.emit('npcDied', { id: npc.id, x: deathX, y: deathY, radius: npc.radius });

  // Respawn NPC near an active player to maintain density around players
  const activePlayers = Object.values(players).filter(p => !p.isInactive && !p.isIdle);

  if (activePlayers.length > 0) {
    // Pick a random active player
    const targetPlayer = activePlayers[Math.floor(Math.random() * activePlayers.length)];

    // Spawn at a random distance/angle from that player
    const angle = Math.random() * Math.PI * 2;
    const minDist = npc.type === 'cell' ? 600 : 300; // Cells spawn further away
    const maxDist = npc.type === 'cell' ? 1200 : 800;
    const dist = minDist + Math.random() * (maxDist - minDist);

    npc.x = targetPlayer.x + Math.cos(angle) * dist;
    npc.y = targetPlayer.y + Math.sin(angle) * dist;
  } else {
    // No active players, spawn near center
    npc.x = (Math.random() - 0.5) * 2000;
    npc.y = (Math.random() - 0.5) * 2000;
  }
  npc.vx = 0;
  npc.vy = 0;
  npc.health = npc.maxHealth;
  npc.provoked = false;
  npc.provokedBy = null;
  npc.attackTarget = null;
  npc.moveTarget = null;
  if (npc.type === 'cell') {
    npc.isTired = false;
    npc.chaseEnergy = npc.maxChaseEnergy;
  }

  io.emit('npcRespawned', npc);
}

// NPC update loop (runs at ~30fps on server)
const NPC_UPDATE_INTERVAL = 33; // ~30fps
setInterval(() => {
  for (let npcId in npcs) {
    updateNPC(npcs[npcId]);
  }

  // Broadcast NPC state to all clients
  io.emit('npcUpdate', npcs);
}, NPC_UPDATE_INTERVAL);

// Spawn a single NPC near active players
function spawnNPCNearPlayers(isCell) {
  const center = getSpawnCenter();
  const activePlayers = Object.values(players).filter(p => !p.isInactive && !p.isIdle);
  const id = `npc_${npcIdCounter++}`;

  let spawnX, spawnY;
  let attempts = 0;
  const maxAttempts = 50;

  do {
    const angle = Math.random() * Math.PI * 2;
    const dist = SPAWN_RADIUS * 0.5 + Math.random() * SPAWN_RADIUS * 0.5;
    spawnX = center.x + Math.cos(angle) * dist;
    spawnY = center.y + Math.sin(angle) * dist;
    attempts++;

    // For cells, ensure minimum distance from all players
    if (isCell && activePlayers.length > 0) {
      let tooClose = false;
      for (let player of activePlayers) {
        const dx = spawnX - player.x;
        const dy = spawnY - player.y;
        if (Math.sqrt(dx * dx + dy * dy) < CELL_MIN_DIST_FROM_PLAYERS) {
          tooClose = true;
          break;
        }
      }
      if (tooClose && attempts < maxAttempts) continue;
    }
    break;
  } while (attempts < maxAttempts);

  const npc = {
    id,
    x: spawnX,
    y: spawnY,
    vx: 0,
    vy: 0,
    color: '#505050',
    radius: isCell ? NPC_CELL_RADIUS : NPC_TADPOLE_RADIUS,
    health: isCell ? NPC_CELL_HEALTH : NPC_TADPOLE_HEALTH,
    maxHealth: isCell ? NPC_CELL_HEALTH : NPC_TADPOLE_HEALTH,
    lastHit: 0,
    lastAttack: 0,
    type: isCell ? 'cell' : 'tadpole',
    moveTarget: null,
    targetChangeTime: 0,
    provoked: false,
    provokedBy: null,
    attackTarget: null,
    chaseEnergy: 100,
    maxChaseEnergy: 100,
    isTired: false,
    tiredStartTime: 0,
    attackLungeTime: 0,
    attackLungeAngle: 0
  };

  npcs[id] = npc;
  return npc;
}

// Maintain NPC density around players - despawn far NPCs, spawn new ones nearby
setInterval(() => {
  const activePlayers = Object.values(players).filter(p => !p.isInactive && !p.isIdle);
  if (activePlayers.length === 0) return;

  const center = getSpawnCenter();
  const targetTadpoles = 6;
  const targetCells = 3;

  let currentTadpoles = 0;
  let currentCells = 0;

  // Count NPCs and remove those too far from all players
  for (let npcId in npcs) {
    const npc = npcs[npcId];

    // Find distance to nearest player
    let nearestDist = Infinity;
    for (let player of activePlayers) {
      const dx = npc.x - player.x;
      const dy = npc.y - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < nearestDist) {
        nearestDist = dist;
      }
    }

    // If too far from all players, remove this NPC
    if (nearestDist > DESPAWN_RADIUS) {
      delete npcs[npcId];
      continue;
    }

    // Count by type
    if (npc.type === 'cell') currentCells++;
    else currentTadpoles++;
  }

  // Spawn new NPCs to maintain density
  while (currentTadpoles < targetTadpoles) {
    spawnNPCNearPlayers(false);
    currentTadpoles++;
  }
  while (currentCells < targetCells) {
    spawnNPCNearPlayers(true);
    currentCells++;
  }
}, 5000); // Check every 5 seconds

// Food expiration and respawn - maintain constant food density around players
const TARGET_FOOD_COUNT = 19;
const FOOD_SPAWN_RADIUS = 1000;
const FOOD_DESPAWN_RADIUS = 1500;
// Spawn/decay rate reduced by 80% (5x slower) while maintaining same equilibrium density
const FOOD_SPAWN_INTERVAL = 10000; // 10 seconds (was 2 seconds)
const FOOD_BASE_TTL = 150000; // 2.5 minutes base TTL (was 30 seconds)
const FOOD_TTL_VARIANCE = 300000; // +0-5 minutes variance (was 60 seconds)

setInterval(() => {
  const now = Date.now();
  const activePlayers = Object.values(players).filter(p => !p.isInactive && !p.isIdle);
  const center = getSpawnCenter();

  // Remove expired food or food too far from players
  for (let foodId in food) {
    const foodItem = food[foodId];

    // Check expiration
    if (foodItem.spawnTime && foodItem.ttl) {
      if (now - foodItem.spawnTime > foodItem.ttl) {
        io.emit('foodEaten', { foodId });
        delete food[foodId];
        continue;
      }
    }

    // Check distance from nearest player (only if there are players)
    if (activePlayers.length > 0) {
      let nearestDist = Infinity;
      for (let player of activePlayers) {
        const dx = foodItem.x - player.x;
        const dy = foodItem.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < nearestDist) nearestDist = dist;
      }

      if (nearestDist > FOOD_DESPAWN_RADIUS) {
        io.emit('foodEaten', { foodId });
        delete food[foodId];
      }
    }
  }

  // Respawn food around players to maintain density (one at a time)
  const currentCount = Object.keys(food).length;

  if (currentCount < TARGET_FOOD_COUNT) {
    const id = `food_${foodIdCounter++}`;
    const baseRadius = 4;
    const sizeVariation = 0.75 + Math.random() * 0.5;

    // Spawn around player center
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * FOOD_SPAWN_RADIUS;

    food[id] = {
      id,
      x: center.x + Math.cos(angle) * dist,
      y: center.y + Math.sin(angle) * dist,
      radius: baseRadius * sizeVariation,
      type: 'plankton', // Natural spawning food
      spawnTime: now,
      ttl: FOOD_BASE_TTL + Math.random() * FOOD_TTL_VARIANCE
    };
    io.emit('foodSpawned', food[id]);
  }
}, FOOD_SPAWN_INTERVAL);

// Initialize NPCs on startup
initializeNPCs();

// Generate food around spawn center
function generateFood(count) {
  const center = getSpawnCenter();

  for (let i = 0; i < count; i++) {
    const id = `food_${foodIdCounter++}`;

    // Spawn around player center
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * FOOD_SPAWN_RADIUS;
    const x = center.x + Math.cos(angle) * dist;
    const y = center.y + Math.sin(angle) * dist;

    // Varying size: 75-125% of base radius (4)
    const baseRadius = 4;
    const sizeVariation = 0.75 + Math.random() * 0.5;
    const radius = baseRadius * sizeVariation;

    food[id] = {
      id,
      x,
      y,
      radius,
      type: 'plankton', // Natural spawning food
      spawnTime: Date.now(),
      ttl: 30000 + Math.random() * 60000
    };
  }
}

// Clear all existing food and initialize
food = {}; // Clear all existing food
foodIdCounter = 0; // Reset counter
generateFood(38); // Start with reasonable amount of food

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

  // Find safe spawn position away from cells
  let spawnX, spawnY;
  let attempts = 0;
  const maxAttempts = 50;
  const MIN_DIST_FROM_CELLS = 400;

  do {
    spawnX = (Math.random() - 0.5) * 3000;
    spawnY = (Math.random() - 0.5) * 3000;
    attempts++;

    // Check distance from all NPC cells
    let tooClose = false;
    for (let npcId in npcs) {
      const npc = npcs[npcId];
      if (npc.type === 'cell') {
        const dx = spawnX - npc.x;
        const dy = spawnY - npc.y;
        if (Math.sqrt(dx * dx + dy * dy) < MIN_DIST_FROM_CELLS) {
          tooClose = true;
          break;
        }
      }
    }
    if (!tooClose) break;
  } while (attempts < maxAttempts);

  // Initialize player
  players[socket.id] = {
    id: socket.id,
    x: spawnX,
    y: spawnY,
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

  // Send all NPCs to new connection
  socket.emit('npcs', npcs);

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

  // Handle chat messages
  socket.on('chat', (data) => {
    if (data && data.name && data.message) {
      // Sanitize and limit message length
      const sanitizedName = String(data.name).substring(0, 20);
      const sanitizedMessage = String(data.message).substring(0, 100);
      // Broadcast to all other players
      socket.broadcast.emit('chat', { name: sanitizedName, message: sanitizedMessage });
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

  // Handle player attacking NPC
  socket.on('attackNPC', (data) => {
    const npc = npcs[data.npcId];
    if (npc && players[socket.id]) {
      const player = players[socket.id];
      const dx = npc.x - player.x;
      const dy = npc.y - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Validate attack range (with some tolerance for latency)
      if (dist < ATTACK_RANGE * 1.5) {
        const damage = data.damage || ATTACK_DAMAGE;
        npc.health -= damage;
        npc.lastHit = Date.now();
        npc.provoked = true;
        npc.provokedBy = socket.id;

        // Knockback
        const angle = Math.atan2(dy, dx);
        npc.vx += Math.cos(angle) * 1;
        npc.vy += Math.sin(angle) * 1;

        // Broadcast damage to all clients
        io.emit('npcDamaged', {
          npcId: npc.id,
          health: npc.health,
          damage: damage,
          x: npc.x,
          y: npc.y
        });

        // Check if NPC died
        if (npc.health <= 0) {
          handleNPCDeath(npc);
        }
      }
    }
  });

  // Handle player type update (for when they transform to cell)
  socket.on('updateType', (data) => {
    if (players[socket.id]) {
      players[socket.id].type = data.type;
      players[socket.id].radius = data.radius || players[socket.id].radius;
    }
  });

  // Handle player-vs-player attacks
  socket.on('attackPlayer', (data) => {
    const targetSocket = io.sockets.sockets.get(data.targetId);
    if (targetSocket && players[data.targetId]) {
      // Forward the damage to the target player
      targetSocket.emit('playerAttacked', {
        attackerId: socket.id,
        damage: data.damage,
        knockbackX: data.knockbackX,
        knockbackY: data.knockbackY
      });
    }
  });

  // Handle player death notification (so other players see it)
  socket.on('playerDied', (data) => {
    // Broadcast to all other players that this player died
    socket.broadcast.emit('otherPlayerDied', {
      playerId: socket.id,
      x: data.x,
      y: data.y
    });
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
        x: (Math.random() - 0.5) * 3000,
        y: (Math.random() - 0.5) * 3000,
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

  // Handle bubble shield state for Protector cells
  socket.on('bubbleShield', (data) => {
    const player = players[socket.id];
    if (player) {
      player.bubbleShieldActive = data.active;
    }
  });

  // Handle world reset command
  socket.on('resetWorld', () => {
    console.log(`World reset requested by ${socket.id}`);

    // Keep only the requesting player
    const requestingPlayer = players[socket.id];
    players = {};
    if (requestingPlayer) {
      players[socket.id] = requestingPlayer;
    }

    // Regenerate food
    food = {};
    foodIdCounter = 0;
    generateFood(15); // Start with some food

    // Reinitialize NPCs using server's NPC system
    initializeNPCs();

    // Broadcast reset to all clients
    io.emit('worldReset', { food, npcs });

    console.log('World reset complete - regenerated food and NPCs');
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
        // 0.5% chance to spawn 1 food item in empty regions (10x rarer)
        if (Math.random() < 0.005) {
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
