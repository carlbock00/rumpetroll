const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const fs = require('fs').promises;
const path = require('path');
const session = require('express-session');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const SqliteStore = require('better-sqlite3-session-store')(session);
const { userOps, progressOps } = require('./db');

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

// Use persistent disk for idle NPCs and user positions if available (Render.com)
const PERSISTENT_DATA_DIR = '/data';
const hasPersistentDisk = require('fs').existsSync(PERSISTENT_DATA_DIR);
const IDLE_NPCS_FILE = hasPersistentDisk
  ? path.join(PERSISTENT_DATA_DIR, 'idle_npcs.json')
  : path.join(__dirname, 'idle_npcs.json');
const USER_POSITIONS_FILE = hasPersistentDisk
  ? path.join(PERSISTENT_DATA_DIR, 'user_positions.json')
  : path.join(__dirname, 'user_positions.json');

console.log(`Using ${hasPersistentDisk ? 'PERSISTENT DISK' : 'LOCAL (ephemeral)'} storage for runtime data`);
console.log(`  Idle NPCs file: ${IDLE_NPCS_FILE}`);
console.log(`  User positions file: ${USER_POSITIONS_FILE}`);

// Use a persistent session secret (generate once, store in file)
const SESSION_SECRET_FILE = hasPersistentDisk
  ? path.join(PERSISTENT_DATA_DIR, '.session_secret')
  : path.join(__dirname, '.session_secret');
let SESSION_SECRET;
try {
  SESSION_SECRET = require('fs').readFileSync(SESSION_SECRET_FILE, 'utf8').trim();
} catch (err) {
  // Generate and save a new secret if file doesn't exist
  SESSION_SECRET = crypto.randomBytes(32).toString('hex');
  require('fs').writeFileSync(SESSION_SECRET_FILE, SESSION_SECRET);
  console.log('Generated new session secret');
}

// Session database path (use persistent disk if available)
const SESSION_DB_PATH = hasPersistentDisk
  ? path.join(PERSISTENT_DATA_DIR, 'sessions.db')
  : path.join(__dirname, 'sessions.db');

// Create session store with SQLite (persists across server restarts)
const sessionDb = new Database(SESSION_DB_PATH);
const sessionStore = new SqliteStore({
  client: sessionDb,
  expired: {
    clear: true,
    intervalMs: 900000 // Clear expired sessions every 15 minutes
  }
});

console.log(`Sessions stored in: ${SESSION_DB_PATH}`);

// Session middleware (using SQLite store - sessions persist across restarts)
const sessionMiddleware = session({
  store: sessionStore,
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
});

// Trust proxy (required for secure cookies behind Render's HTTPS proxy)
app.set('trust proxy', 1);

// JSON body parser
app.use(express.json());

// Apply session middleware
app.use(sessionMiddleware);

// Auth routes
const authRoutes = require('./auth');
app.use('/api/auth', authRoutes);

// Serve static files
app.use(express.static('public'));

// Share session with Socket.IO
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// In-memory player storage
let players = {};

// Track which sockets belong to which username (for multi-window support)
// userSockets[username] = Set of socket IDs
let userSockets = {};
// socketToUser[socketId] = username
let socketToUser = {};

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

// Helper: Check if an entity at position (x,y) is protected by any bubble shield
function isEntityProtectedByShield(entityX, entityY) {
  // Check all players for active protector shields
  for (let protectorId in players) {
    const protector = players[protectorId];
    if (!protector) continue;
    if (protector.hasProtector && protector.bubbleShieldActive) {
      let shieldX = protector.x;
      let shieldY = protector.y;
      let cellRadius = 40;

      if (protector.type === 'cell') {
        cellRadius = protector.radius || 40;
      } else if (protector.creatures) {
        const protectorCell = protector.creatures.find(c => c.type === 'cell' && c.hasProtector);
        if (protectorCell && protectorCell.x !== undefined) {
          shieldX = protectorCell.x;
          shieldY = protectorCell.y;
          cellRadius = protectorCell.radius || 40;
        }
      }

      const shieldRadius = cellRadius * 12;
      const dx = entityX - shieldX;
      const dy = entityY - shieldY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < shieldRadius) {
        return true;
      }
    }
  }

  // Also check idle NPCs with protector shields
  for (let npcId in npcs) {
    const npc = npcs[npcId];
    if (npc.isIdlePlayer && npc.hasProtector && npc.bubbleShieldActive) {
      const shieldRadius = (npc.radius || 20) * 12;
      const dx = entityX - npc.x;
      const dy = entityY - npc.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < shieldRadius) {
        return true;
      }
    }
  }

  return false;
}

// Update single NPC behavior
function updateNPC(npc) {
  const now = Date.now();

  // Idle players: no wandering, but chase and fight back when provoked (attacked)
  const isIdlePlayer = npc.isIdlePlayer;
  const idlePlayerProvoked = isIdlePlayer && npc.provoked;

  // Random wandering movement (skip for idle players)
  if (!isIdlePlayer && (!npc.moveTarget || now - npc.targetChangeTime > 3000)) {
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
    if (player.isInactive) {
      // console.log(`NPC ${npc.id} skipping inactive player ${player.name}`);
      continue;
    }
    // Skip players in test mode (cheat)
    if (player.testMode) {
      console.log(`NPC ${npc.id} skipping player ${player.name} - testMode=${player.testMode}`);
      continue;
    }

    // Find the closest vulnerable creature (tadpole/bacteria) to this NPC
    let closestVulnerableDist = Infinity;
    let closestVulnerableCreature = null;
    let hasVulnerableCreature = false;

    // Check primary creature
    const playerType = player.type || 'tadpole';
    if (playerType !== 'cell') {
      const dx = npc.x - player.x;
      const dy = npc.y - player.y;
      closestVulnerableDist = Math.sqrt(dx * dx + dy * dy);
      closestVulnerableCreature = { x: player.x, y: player.y, type: playerType };
      hasVulnerableCreature = true;
    }

    // Check all secondary creatures for closer vulnerable targets
    if (player.creatures && player.creatures.length > 0) {
      for (const creature of player.creatures) {
        if (creature.type !== 'cell' && creature.x !== undefined && creature.y !== undefined) {
          const dx = npc.x - creature.x;
          const dy = npc.y - creature.y;
          const creatureDist = Math.sqrt(dx * dx + dy * dy);
          if (creatureDist < closestVulnerableDist) {
            closestVulnerableDist = creatureDist;
            closestVulnerableCreature = creature;
          }
          hasVulnerableCreature = true;
        }
      }
    }

    // Use the closest vulnerable creature for distance checks
    const dist = closestVulnerableCreature ? closestVulnerableDist : Math.sqrt((npc.x - player.x) ** 2 + (npc.y - player.y) ** 2);
    const dx = closestVulnerableCreature ? npc.x - closestVulnerableCreature.x : npc.x - player.x;
    const dy = closestVulnerableCreature ? npc.y - closestVulnerableCreature.y : npc.y - player.y;

    // Check if the closest vulnerable creature is protected by any protector's bubble shield FIRST
    // If shielded, NPC cells should not chase or attack at all
    const targetX = closestVulnerableCreature ? closestVulnerableCreature.x : player.x;
    const targetY = closestVulnerableCreature ? closestVulnerableCreature.y : player.y;
    let isProtectedByShield = false;

    // Check all players for active protector shields that cover the target creature
    for (let protectorId in players) {
      const protector = players[protectorId];
      if (!protector) continue;
      if (protector.hasProtector && protector.bubbleShieldActive) {
        // Find the protector cell's position and radius (could be primary or secondary creature)
        let shieldX = protector.x;
        let shieldY = protector.y;
        let cellRadius = 40; // Default cell radius

        // If protector's primary is a cell, use its position and radius
        if (protector.type === 'cell') {
          cellRadius = protector.radius || 40;
        } else if (protector.creatures) {
          // Primary isn't a cell - find the protector cell among secondary creatures
          const protectorCell = protector.creatures.find(c => c.type === 'cell' && c.hasProtector);
          if (protectorCell && protectorCell.x !== undefined) {
            shieldX = protectorCell.x;
            shieldY = protectorCell.y;
            cellRadius = protectorCell.radius || 40;
          }
        }

        const shieldRadius = cellRadius * 12;
        const shieldDx = targetX - shieldX;
        const shieldDy = targetY - shieldY;
        const shieldDist = Math.sqrt(shieldDx * shieldDx + shieldDy * shieldDy);
        if (shieldDist < shieldRadius) {
          isProtectedByShield = true;
          break;
        }
      }
    }

    // For NPC cells: if target is shielded, don't chase or attack - skip this player entirely
    if (npc.type === 'cell' && isProtectedByShield && hasVulnerableCreature) {
      continue; // Skip to next player - this target is protected
    }

    const cellCanChase = npc.type === 'cell' && !npc.isTired && hasVulnerableCreature;
    const cellCanAttack = npc.type === 'cell' && hasVulnerableCreature; // Cells can attack even when tired
    const isAggressive = npc.provoked || cellCanChase;
    const canAttackWhileTired = npc.provoked || cellCanAttack; // Allow attacking even when tired
    const spotRange = npc.type === 'cell' ? 400 : 300;

    if (isAggressive && dist < spotRange) {
      isChasing = true;

      // Chase the player (idle players only chase when provoked)
      if ((!isIdlePlayer || idlePlayerProvoked) && dist > ATTACK_RANGE * 0.8) {
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
    }

    // Attack when in range - cells can attack even while tired if target walks into range
    // Idle players CAN still attack when provoked and player is in range
    // NPC cells NEVER attack player cells - only tadpoles (but will attack if player has any tadpoles)
    const canAttackTarget = !(npc.type === 'cell' && !hasVulnerableCreature);

    if (canAttackWhileTired && canAttackTarget && dist < ATTACK_RANGE && now - npc.lastAttack > NPC_ATTACK_COOLDOWN && !isProtectedByShield) {
      const baseDamage = npc.type === 'cell' ? NPC_CELL_DAMAGE : NPC_TADPOLE_DAMAGE;
      const actualDamage = baseDamage * (playerType === 'cell' ? CELL_DAMAGE_RESISTANCE : 1);

      npc.lastAttack = now;
      npc.attackLungeTime = now;
      npc.attackLungeAngle = Math.atan2(-dy, -dx);

      // Send damage event to ALL sockets for this player (handles secondary windows)
      const username = player.name;
      const playerSocketIds = userSockets[username] || [playerId];
      for (const sockId of playerSocketIds) {
        const sock = io.sockets.sockets.get(sockId);
        if (sock) {
          sock.emit('npcAttack', {
            npcId: npc.id,
            damage: actualDamage,
            knockbackX: -Math.cos(npc.attackLungeAngle) * 0.5,
            knockbackY: -Math.sin(npc.attackLungeAngle) * 0.5
          });
        }
      }
    }

    // Tadpoles clear provoked state after 8 seconds
    if (npc.type !== 'cell' && now - npc.lastHit > 8000 && now - npc.lastAttack > 8000) {
      npc.provoked = false;
      npc.provokedBy = null;
    }

    // Peaceful tadpoles avoid players (idle players don't move)
    if (!isIdlePlayer && !isAggressive && dist < 100 && npc.type === 'tadpole') {
      const avoidAngle = Math.atan2(dy, dx);
      npc.vx += Math.cos(avoidAngle) * 0.015;
      npc.vy += Math.sin(avoidAngle) * 0.015;
    }

    // Even non-aggressive NPCs should attack if player walks into attack range
    // This handles tired cells that aren't chasing but player comes to them
    if (!isAggressive && canAttackWhileTired && canAttackTarget && dist < ATTACK_RANGE && now - npc.lastAttack > NPC_ATTACK_COOLDOWN && !isProtectedByShield) {
      const baseDamage = npc.type === 'cell' ? NPC_CELL_DAMAGE : NPC_TADPOLE_DAMAGE;
      const actualDamage = baseDamage * (playerType === 'cell' ? CELL_DAMAGE_RESISTANCE : 1);

      npc.lastAttack = now;
      npc.attackLungeTime = now;
      npc.attackLungeAngle = Math.atan2(-dy, -dx);

      console.log(`Non-aggressive NPC ${npc.id} ATTACKING ${player.name} (walked into range) for ${actualDamage} damage`);

      // Send damage event to ALL sockets for this player
      const username = player.name;
      const playerSocketIds = userSockets[username] || [playerId];
      for (const sockId of playerSocketIds) {
        const sock = io.sockets.sockets.get(sockId);
        if (sock) {
          sock.emit('npcAttack', {
            npcId: npc.id,
            damage: actualDamage,
            knockbackX: -Math.cos(npc.attackLungeAngle) * 0.5,
            knockbackY: -Math.sin(npc.attackLungeAngle) * 0.5
          });
        }
      }
    }
  }

  // Reset sprinting when not chasing
  if (!isChasing && npc.type === 'cell') {
    npc.isSprinting = false;
  }

  // NPC cells seek and collect food when not chasing players (idle players don't seek food)
  let isSeekingFood = false;
  if (!isIdlePlayer && !isChasing && npc.type === 'cell') {
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

      // Check if close enough to eat (with pickup buffer for easier collection)
      const FOOD_PICKUP_BUFFER = 15;
      const eatRange = npc.radius + nearestFood.radius + FOOD_PICKUP_BUFFER;
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

  // Wander if not chasing and not seeking food (idle players don't wander)
  if (!isIdlePlayer && !isChasing && !isSeekingFood && npc.moveTarget) {
    const dx = npc.moveTarget.x - npc.x;
    const dy = npc.moveTarget.y - npc.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < ARRIVAL_THRESHOLD) {
      npc.moveTarget = null;
      npc.vx *= 0.985;
      npc.vy *= 0.985;
    } else {
      // Cells wander slowly, bacteria moderate, tadpoles at normal speed
      let moveSpeed = npc.type === 'cell' ? NPC_MOVE_SPEED * 0.35 :
                      npc.type === 'bacteria' ? NPC_MOVE_SPEED * 0.5 : NPC_MOVE_SPEED;
      const decelerationZone = ARRIVAL_THRESHOLD * 2;
      if (dist < decelerationZone) {
        const speedMultiplier = 0.5 + 0.5 * (dist - ARRIVAL_THRESHOLD) / (decelerationZone - ARRIVAL_THRESHOLD);
        moveSpeed *= speedMultiplier;
      }
      npc.vx += (dx / dist) * moveSpeed;
      npc.vy += (dy / dist) * moveSpeed;
    }
  }

  // NPC vs NPC combat (rare) - idle players don't initiate NPC fights
  // Cells only attack tadpoles, not other cells
  // NPCs never attack idle player NPCs (they're protected until a real player attacks them)
  if (!isIdlePlayer && !npc.attackTarget && Math.random() < 0.001) {
    const nearbyNPCs = Object.values(npcs).filter(other => {
      if (other.id === npc.id) return false;
      // Cells only target tadpoles, not other cells
      if (npc.type === 'cell' && other.type === 'cell') return false;
      // NPCs never attack idle player NPCs (they're protected)
      if (other.isIdlePlayer) return false;
      const dx = other.x - npc.x;
      const dy = other.y - npc.y;
      return Math.sqrt(dx * dx + dy * dy) < 200;
    });
    if (nearbyNPCs.length > 0) {
      npc.attackTarget = nearbyNPCs[Math.floor(Math.random() * nearbyNPCs.length)].id;
    }
  }

  // Attack another NPC (idle players don't chase NPCs)
  if (!isIdlePlayer && npc.attackTarget) {
    const target = npcs[npc.attackTarget];
    // NPCs don't attack idle player NPCs (they're protected)
    if (target && target.isIdlePlayer) {
      npc.attackTarget = null;
    } else if (target && target.health > 0) {
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
        target.health = Math.max(0, target.health - actualDamage);
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

    // Skip collision if either NPC has an active bubble shield
    if (npc.bubbleShieldActive || other.bubbleShieldActive) continue;

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

    // Skip collision/push if player is protected by any bubble shield
    if (player.bubbleShieldActive || isEntityProtectedByShield(player.x, player.y)) continue;

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
  const wasIdlePlayer = npc.isIdlePlayer;
  const idlePlayerName = npc.name;

  // If this was an idle player, emit special event and remove (don't respawn)
  if (wasIdlePlayer) {
    console.log(`Idle player ${idlePlayerName} was killed`);

    // Mark user as died while inactive (persists to file) so they see death screen on reconnect
    if (idlePlayerName && !idlePlayerName.startsWith('Player')) {
      console.log(`Marking ${idlePlayerName} as died while inactive`);
      userPositions[idlePlayerName] = { diedWhileInactive: true };
      saveUserPositions();
    }

    // Emit to all clients that an idle player died (they'll show death screen if it was them)
    io.emit('idlePlayerDied', {
      id: npc.id,
      name: idlePlayerName,
      x: deathX,
      y: deathY,
      radius: npc.radius
    });
    // Remove the idle player NPC permanently (no respawn)
    delete npcs[npc.id];
    // Don't drop food or respawn - just return
    return;
  }

  // Cells drop 1 nucleotide + 1-2 plankton, Tadpoles drop random plankton (2-5)
  const planktonCount = wasCell ? 1 + Math.floor(Math.random() * 2) : 2 + Math.floor(Math.random() * 4);
  console.log(`NPC ${npc.id} (${npc.type}) died at (${deathX.toFixed(0)}, ${deathY.toFixed(0)}), dropping ${wasCell ? '1 nucleotide + ' : ''}${planktonCount} plankton`);

  // Cells always drop 1 nucleotide
  if (wasCell) {
    const id = `food_${foodIdCounter++}`;
    const angle = Math.random() * Math.PI * 2;
    const dist = 15 + Math.random() * 15;

    food[id] = {
      id,
      x: deathX + Math.cos(angle) * dist,
      y: deathY + Math.sin(angle) * dist,
      radius: 6,
      type: 'nucleotide',
      spawnTime: Date.now(),
      ttl: 30000 // 30 seconds
    };
    io.emit('foodSpawned', food[id]);
  }

  // Drop plankton (all creatures)
  for (let i = 0; i < planktonCount; i++) {
    const id = `food_${foodIdCounter++}`;
    const angle = Math.random() * Math.PI * 2;
    const dist = 15 + Math.random() * 15;

    food[id] = {
      id,
      x: deathX + Math.cos(angle) * dist,
      y: deathY + Math.sin(angle) * dist,
      radius: 4,
      type: 'plankton',
      spawnTime: Date.now(),
      ttl: 30000 + Math.random() * 60000 // 30-90 seconds
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
  const now = Date.now();

  for (let npcId in npcs) {
    const npc = npcs[npcId];

    // Validate NPC position - remove NPCs with invalid positions
    const hasValidX = typeof npc.x === 'number' && isFinite(npc.x);
    const hasValidY = typeof npc.y === 'number' && isFinite(npc.y);
    if (!hasValidX || !hasValidY) {
      console.log(`Removing NPC ${npcId} with invalid position: x=${npc.x}, y=${npc.y}`);
      delete npcs[npcId];
      continue;
    }

    // Remove NPCs with negative or zero health (should be dead)
    if (typeof npc.health === 'number' && npc.health <= 0) {
      console.log(`Removing dead NPC ${npc.name || npcId} with health ${npc.health}`);
      io.emit('npcDied', { id: npcId, x: npc.x, y: npc.y, radius: npc.radius });
      delete npcs[npcId];
      continue;
    }

    // Fix NaN velocities
    if (typeof npc.vx !== 'number' || !isFinite(npc.vx)) npc.vx = 0;
    if (typeof npc.vy !== 'number' || !isFinite(npc.vy)) npc.vy = 0;

    // Clean up very old idle player NPCs (older than 48 hours with no activity)
    if (npc.isIdlePlayer) {
      const lastActivity = Math.max(npc.lastHit || 0, npc.lastMoveTime || 0, npc.targetChangeTime || 0);
      const MAX_IDLE_AGE = 48 * 60 * 60 * 1000; // 48 hours
      if (lastActivity > 0 && now - lastActivity > MAX_IDLE_AGE) {
        console.log(`Removing stale idle NPC ${npc.name || npcId} (inactive for ${Math.round((now - lastActivity) / 3600000)}h)`);
        delete npcs[npcId];
        continue;
      }
    }

    updateNPC(npc);
  }

  // Broadcast NPC state to all clients
  io.emit('npcUpdate', npcs);
}, NPC_UPDATE_INTERVAL);

// Player state broadcast loop - authoritative server state for all players
// This ensures all clients have consistent view of all players' state
const PLAYER_UPDATE_INTERVAL = 100; // 10 updates per second (reduced from 20 to prevent lag)
setInterval(() => {
  // Only broadcast if there are active players
  const activePlayers = Object.values(players).filter(p => !p.isInactive);
  if (activePlayers.length > 0) {
    // Build a compact player state object with all relevant properties
    const playerStates = {};
    for (let playerId in players) {
      const p = players[playerId];
      if (p.isInactive || p.isDead) continue; // Skip inactive AND dead players
      playerStates[playerId] = {
        id: playerId,
        x: p.x,
        y: p.y,
        vx: p.vx || 0,
        vy: p.vy || 0,
        health: p.health,
        maxHealth: p.maxHealth,
        food: p.food || 0,
        nucleotides: p.nucleotides || 0,
        type: p.type || 'tadpole',
        radius: p.radius || 8,
        name: p.name,
        color: p.color,
        score: p.score || 0,
        angle: p.angle || 0,
        // Combat state
        lastHit: p.lastHit || 0,
        bubbleShieldActive: p.bubbleShieldActive || false,
        // Creature properties
        hasProtector: p.hasProtector || false,
        hasSword: p.hasSword || false,
        hasCellTail: p.hasCellTail || false,
        // All creatures (for multi-creature visibility)
        creatures: p.creatures || []
      };
    }
    io.emit('playerStateUpdate', playerStates);
  }
}, PLAYER_UPDATE_INTERVAL);

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

    // Never despawn idle player NPCs - they persist until killed
    if (npc.isIdlePlayer) {
      // But DO remove idle NPCs for users who are currently connected (bug safeguard)
      const ownerName = npc.ownerName || npc.name;
      if (ownerName) {
        // Check if this user has an active player connection
        for (let playerId in players) {
          const player = players[playerId];
          if (player.name === ownerName) {
            // This idle NPC's owner is connected - remove the idle NPC
            console.log(`Removing stale idle NPC for connected user ${ownerName}: ${npcId}`);
            io.emit('npcDied', { id: npcId, x: npc.x, y: npc.y, radius: npc.radius });
            delete npcs[npcId];
            break;
          }
        }
      }
      // Don't count idle players toward NPC limits
      continue;
    }

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
const TARGET_FOOD_COUNT = 29; // Increased 50% from 19
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
generateFood(57); // Start with reasonable amount of food (increased 50%)

// User positions storage - persists across reconnections by username
// Also stores { diedWhileInactive: true } for users who died while inactive
let userPositions = {};
// USER_POSITIONS_FILE is defined at the top (uses persistent disk if available)

// Load user positions from file
async function loadUserPositions() {
  try {
    const data = await fs.readFile(USER_POSITIONS_FILE, 'utf8');
    userPositions = JSON.parse(data);
    console.log('User positions loaded from file');
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('No existing user positions found, starting fresh');
      userPositions = {};
    } else {
      console.error('Error loading user positions:', error);
    }
  }
}

// Save user positions to file
async function saveUserPositions() {
  try {
    await fs.writeFile(USER_POSITIONS_FILE, JSON.stringify(userPositions, null, 2));
  } catch (error) {
    console.error('Error saving user positions:', error);
  }
}

// Load players from JSON file
// NOTE: We no longer load old players as they don't have active socket connections
// Players are only valid while they have an active connection
async function loadPlayers() {
  // Start with empty players - old players from file don't have sockets
  players = {};
  console.log('Players initialized (not loading from file - players need active connections)');
}

// Save players to JSON file
async function savePlayers() {
  try {
    await fs.writeFile(DATA_FILE, JSON.stringify(players, null, 2));
  } catch (error) {
    console.error('Error saving players:', error);
  }
}

// Save idle NPCs to file (only idle player NPCs, not regular NPCs)
async function saveIdleNpcs() {
  try {
    const idleNpcs = {};
    for (let npcId in npcs) {
      const npc = npcs[npcId];
      if (npc.isIdlePlayer) {
        idleNpcs[npcId] = npc;
      }
    }
    const count = Object.keys(idleNpcs).length;
    if (count > 0) {
      console.log(`Saving ${count} idle NPCs to ${IDLE_NPCS_FILE}...`);
      await fs.writeFile(IDLE_NPCS_FILE, JSON.stringify(idleNpcs, null, 2));
      console.log(`Successfully saved ${count} idle NPCs`);
    }
  } catch (error) {
    console.error('Error saving idle NPCs:', error);
  }
}

// Load idle NPCs from file
async function loadIdleNpcs() {
  console.log(`Attempting to load idle NPCs from ${IDLE_NPCS_FILE}...`);
  try {
    const data = await fs.readFile(IDLE_NPCS_FILE, 'utf8');
    const savedIdleNpcs = JSON.parse(data);
    let loadedCount = 0;
    const loadedNames = [];
    for (let npcId in savedIdleNpcs) {
      const savedNpc = savedIdleNpcs[npcId];

      // Sanity check: skip NPCs with invalid health (should have died)
      if (savedNpc.health <= 0) {
        console.log(`Skipping dead idle NPC ${savedNpc.name || npcId} (health: ${savedNpc.health})`);
        continue;
      }

      // Restore idle NPC with all its properties
      npcs[npcId] = {
        ...savedNpc,
        // Ensure health is valid (fix any corrupted data)
        health: Math.max(1, savedNpc.health || savedNpc.maxHealth || 80),
        lastMoveTime: Date.now(),
        lastAttack: 0,
        lastHit: 0
      };
      loadedCount++;
      if (savedNpc.name) loadedNames.push(savedNpc.name);
    }
    if (loadedCount > 0) {
      console.log(`Loaded ${loadedCount} idle player NPCs from file: ${loadedNames.join(', ')}`);
    } else {
      console.log('No idle NPCs found in file');
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('No idle NPCs file found (first run or empty)');
    } else {
      console.error('Error loading idle NPCs:', error);
    }
  }
}

// Auto-save every 30 seconds
setInterval(savePlayers, 30000);
setInterval(saveUserPositions, 5000); // Save positions more frequently
setInterval(saveIdleNpcs, 5000); // Save idle NPCs frequently

// Shield cost processing - 1 food per hour
const SHIELD_COST_INTERVAL = 60 * 60 * 1000; // 1 hour in milliseconds
setInterval(() => {
  const now = Date.now();

  for (let playerId in players) {
    const player = players[playerId];
    if (player.bubbleShieldActive && player.shieldLastCharge) {
      // Check if an hour has passed since last charge
      if (now - player.shieldLastCharge >= SHIELD_COST_INTERVAL) {
        // Check if player has food
        if ((player.food || 0) >= 1) {
          // Deduct food
          player.food = (player.food || 0) - 1;
          player.shieldLastCharge = now;
          // Notify client
          const sock = io.sockets.sockets.get(playerId);
          if (sock) {
            sock.emit('foodUpdate', { food: player.food });
            sock.emit('shieldCharged', { cost: 1, remaining: player.food });
          }
        } else {
          // No food - deactivate shield
          player.bubbleShieldActive = false;
          player.shieldLastCharge = null;
          // Notify client
          const sock = io.sockets.sockets.get(playerId);
          if (sock) {
            sock.emit('shieldDeactivated', { reason: 'Out of food' });
          }
          console.log(`Shield deactivated for ${player.name} - out of food`);
        }
      }
    }
  }
}, 60000); // Check every minute

// Helper: Find safe spawn position away from cells
function findSafeSpawnPosition() {
  let spawnX, spawnY;
  let attempts = 0;
  const maxAttempts = 50;
  const MIN_DIST_FROM_CELLS = 400;

  do {
    spawnX = (Math.random() - 0.5) * 3000;
    spawnY = (Math.random() - 0.5) * 3000;
    attempts++;

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

  return { x: spawnX, y: spawnY };
}

// Helper: Find primary player ID for a username
function findPlayerByUsername(username) {
  for (let playerId in players) {
    if (players[playerId].name === username) {
      return playerId;
    }
  }
  return null;
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  const session = socket.request.session;
  const sessionUsername = session?.username;

  console.log('New player connected:', socket.id, sessionUsername ? `(logged in as ${sessionUsername})` : '(anonymous)');

  // Check if this user already has an active player (multi-window scenario)
  let isSecondaryWindow = false;
  let primaryPlayerId = null;

  if (sessionUsername) {
    primaryPlayerId = findPlayerByUsername(sessionUsername);
    if (primaryPlayerId) {
      // This user already has an active player - this is a secondary window
      isSecondaryWindow = true;
      console.log(`User ${sessionUsername} already has active player ${primaryPlayerId}, socket ${socket.id} is secondary`);

      // Track this socket as belonging to this user
      if (!userSockets[sessionUsername]) {
        userSockets[sessionUsername] = new Set();
      }
      userSockets[sessionUsername].add(socket.id);
      userSockets[sessionUsername].add(primaryPlayerId);
      socketToUser[socket.id] = sessionUsername;

      // Send the existing player's data to this window (use primary player's ID)
      const existingPlayer = players[primaryPlayerId];
      socket.emit('init', {
        id: primaryPlayerId, // Use primary player's ID so all windows see same player
        player: existingPlayer,
        isSecondary: true
      });

      // Send all players to new connection
      socket.emit('players', players);
      socket.emit('food', food);
      socket.emit('npcs', npcs);

      // Don't create a new player entry or broadcast playerJoined
      // The socket will forward commands to the primary player
    }
  }

  // Only create a new player if this is not a secondary window
  if (!isSecondaryWindow) {
    const spawnPos = findSafeSpawnPosition();

    players[socket.id] = {
      id: socket.id,
      x: spawnPos.x,
      y: spawnPos.y,
      vx: 0,
      vy: 0,
      color: '#FFFFFF',
      radius: 8,
      score: 0,
      name: sessionUsername || `Player${Math.floor(Math.random() * 1000)}`,
      lastMoveTime: Date.now(),
      isIdle: false,
      type: 'tadpole',
      creatures: [] // Initialize creatures array
    };

    // If logged in, set up user tracking and check for position restoration
    if (sessionUsername) {
      // Clean up any orphaned secondary sockets from previous sessions
      if (userSockets[sessionUsername]) {
        // Clear old socket tracking - this is a fresh primary connection
        userSockets[sessionUsername].forEach(oldSocketId => {
          delete socketToUser[oldSocketId];
        });
        userSockets[sessionUsername].clear();
      } else {
        userSockets[sessionUsername] = new Set();
      }
      userSockets[sessionUsername].add(socket.id);
      socketToUser[socket.id] = sessionUsername;

      // Check if this user died while inactive FIRST (before any restoration)
      let diedWhileInactive = false;
      if (userPositions[sessionUsername]?.diedWhileInactive) {
        console.log(`User ${sessionUsername} died while inactive - showing death screen, starting fresh`);
        diedWhileInactive = true;
        delete userPositions[sessionUsername]; // Clear the flag
        saveUserPositions();

        // Remove any lingering idle NPCs for this user
        for (let npcId in npcs) {
          const npc = npcs[npcId];
          if (npc.isIdlePlayer && npc.name === sessionUsername) {
            io.emit('npcDied', { id: npcId, x: npc.x, y: npc.y, radius: npc.radius });
            delete npcs[npcId];
          }
        }
        // Don't restore anything - they start fresh as tadpole
      } else {
        // Check for ALL idle NPCs to restore from (not just the first one)
        const userIdleNpcs = [];
        for (let npcId in npcs) {
          const npc = npcs[npcId];
          if (npc.isIdlePlayer && (npc.ownerName === sessionUsername || npc.name === sessionUsername)) {
            userIdleNpcs.push({ id: npcId, npc: npc });
          }
        }

        if (userIdleNpcs.length > 0) {
          console.log(`Restoring ${userIdleNpcs.length} creatures for ${sessionUsername} from idle NPCs`);

          // Update player position from first idle NPC
          const firstNpc = userIdleNpcs[0].npc;
          players[socket.id].x = firstNpc.x;
          players[socket.id].y = firstNpc.y;
          players[socket.id].type = firstNpc.type;
          players[socket.id].radius = firstNpc.radius;
          players[socket.id].health = firstNpc.health;
          players[socket.id].hasProtector = firstNpc.hasProtector || false;
          players[socket.id].bubbleShieldActive = firstNpc.bubbleShieldActive || false;
          players[socket.id].testMode = false; // Reset test mode on reconnect

          // Build creatures array for client
          const restoredCreatures = userIdleNpcs.map(({ id, npc }) => ({
            id: npc.originalCreatureId || id,
            x: npc.x,
            y: npc.y,
            type: npc.type,
            radius: npc.radius,
            health: npc.health,
            maxHealth: npc.maxHealth,
            food: npc.food,
            nucleotides: npc.nucleotides || 0,
            angle: npc.angle,
            // Tadpole upgrades
            healthLevel: npc.healthLevel || 0,
            strengthLevel: npc.strengthLevel || 0,
            capacityLevel: npc.capacityLevel || 0,
            maxHealthBonus: npc.maxHealthBonus || 0,
            strengthBonus: npc.strengthBonus || 0,
            // Cell upgrades
            cellHealthLevel: npc.cellHealthLevel || 0,
            cellStrengthLevel: npc.cellStrengthLevel || 0,
            cellCapacityLevel: npc.cellCapacityLevel || 0,
            cellSpeedLevel: npc.cellSpeedLevel || 0,
            cellSpeedBonus: npc.cellSpeedBonus || 0,
            cellStrengthBonus: npc.cellStrengthBonus || 0,
            cellMaxHealthBonus: npc.cellMaxHealthBonus || 0,
            hasProtector: npc.hasProtector || false,
            bubbleShieldActive: npc.bubbleShieldActive || false,
            hasSword: npc.hasSword || false,
            hasCellTail: npc.hasCellTail || false,
            canHibernate: npc.canHibernate || false,
            // Bacteria-specific
            isFarming: npc.isFarming || false
          }));

          // Store creatures to send after init
          players[socket.id].restoredCreatures = restoredCreatures;

          // Remove ALL idle NPCs for this user
          userIdleNpcs.forEach(({ id, npc }) => {
            io.emit('npcDied', { id: id, x: npc.x, y: npc.y, radius: npc.radius });
            delete npcs[id];
          });
        } else {
          // No idle NPCs found - try to restore from userPositions as fallback
          // This handles the case where server restarted but idle NPCs weren't loaded yet
          const savedState = userPositions[sessionUsername];
          if (savedState && !savedState.diedWhileInactive && savedState.type) {
            console.log(`Connection: Restoring from userPositions for ${sessionUsername} (no idle NPCs found)`);
            const p = players[socket.id];

            // Restore position and type
            p.x = savedState.x;
            p.y = savedState.y;
            p.type = savedState.type;
            p.radius = savedState.radius || (savedState.type === 'cell' ? 40 : (savedState.type === 'bacteria' ? 18 : 8));
            p.health = savedState.health;
            p.maxHealth = savedState.maxHealth;
            p.food = savedState.food;
            p.nucleotides = savedState.nucleotides || 0;

            // Tadpole upgrades
            p.healthLevel = savedState.healthLevel || 0;
            p.strengthLevel = savedState.strengthLevel || 0;
            p.capacityLevel = savedState.capacityLevel || 0;
            p.maxHealthBonus = savedState.maxHealthBonus || 0;
            p.strengthBonus = savedState.strengthBonus || 0;

            // Cell upgrades
            p.cellHealthLevel = savedState.cellHealthLevel || 0;
            p.cellStrengthLevel = savedState.cellStrengthLevel || 0;
            p.cellCapacityLevel = savedState.cellCapacityLevel || 0;
            p.cellSpeedLevel = savedState.cellSpeedLevel || 0;
            p.cellSpeedBonus = savedState.cellSpeedBonus || 0;
            p.cellStrengthBonus = savedState.cellStrengthBonus || 0;
            p.cellMaxHealthBonus = savedState.cellMaxHealthBonus || 0;
            p.hasProtector = savedState.hasProtector || false;
            p.bubbleShieldActive = savedState.bubbleShieldActive || false;
            p.hasSword = savedState.hasSword || false;
            p.hasCellTail = savedState.hasCellTail || false;
            p.canHibernate = savedState.canHibernate || false;

            // If there are saved creatures, restore them
            if (savedState.creatures && savedState.creatures.length > 0) {
              p.restoredCreatures = savedState.creatures;
            }
          }
        }
      }
    } else {
      // Not logged in - no diedWhileInactive check needed
      var diedWhileInactive = false;
    }

    // Get restored creatures if any (and remove from player object)
    const restoredCreatures = players[socket.id].restoredCreatures;
    delete players[socket.id].restoredCreatures;

    // Send current player their data
    socket.emit('init', {
      id: socket.id,
      player: players[socket.id],
      diedWhileInactive: diedWhileInactive,
      restoredCreatures: restoredCreatures // Include all restored creature positions
    });

    // Send all players to new connection
    socket.emit('players', players);
    socket.emit('food', food);
    socket.emit('npcs', npcs);

    // Broadcast new player to all other clients
    socket.broadcast.emit('playerJoined', players[socket.id]);
  }

  // Handle player movement
  socket.on('move', (data) => {
    // Check if this is a secondary socket - find the primary player
    const username = socketToUser[socket.id];
    let targetPlayerId = socket.id;
    const isSecondary = username && !players[socket.id];

    if (username && !players[socket.id]) {
      // This socket doesn't have its own player - it's secondary
      // Find the primary player for this user
      const primaryId = findPlayerByUsername(username);
      if (primaryId) {
        targetPlayerId = primaryId;
      }
    }

    // If player was converted to NPC, re-add them to players
    if (!players[targetPlayerId]) {
      console.log(`Player ${targetPlayerId} became active again, re-adding to players`);
      players[targetPlayerId] = {
        id: targetPlayerId,
        x: data.x,
        y: data.y,
        vx: data.vx,
        vy: data.vy,
        color: '#FFFFFF',
        radius: 8,
        score: 0,
        name: username || `Player${Math.floor(Math.random() * 1000)}`,
        lastMoveTime: Date.now(),
        isIdle: false,
        type: data.type || 'tadpole'
      };
      // Notify all clients this player is active again
      io.emit('playerActive', { id: targetPlayerId });
      // Broadcast player joined
      socket.broadcast.emit('playerJoined', players[targetPlayerId]);
    } else {
      players[targetPlayerId].x = data.x;
      players[targetPlayerId].y = data.y;
      players[targetPlayerId].vx = data.vx;
      players[targetPlayerId].vy = data.vy;
      players[targetPlayerId].lastMoveTime = Date.now();

      // Save position by username for persistence across reconnections
      // But don't overwrite if user has a diedWhileInactive flag (they're dead, waiting to see death screen)
      const playerName = players[targetPlayerId].name;
      const p = players[targetPlayerId];
      if (playerName && !playerName.startsWith('Player') && !userPositions[playerName]?.diedWhileInactive) {
        userPositions[playerName] = {
          x: data.x,
          y: data.y,
          type: p.type || 'tadpole',
          radius: p.radius || 8,
          // State
          health: p.health,
          maxHealth: p.maxHealth,
          food: p.food,
          nucleotides: p.nucleotides || 0,
          // Tadpole upgrades
          healthLevel: p.healthLevel || 0,
          strengthLevel: p.strengthLevel || 0,
          capacityLevel: p.capacityLevel || 0,
          maxHealthBonus: p.maxHealthBonus || 0,
          strengthBonus: p.strengthBonus || 0,
          // Cell upgrades
          cellHealthLevel: p.cellHealthLevel || 0,
          cellStrengthLevel: p.cellStrengthLevel || 0,
          cellCapacityLevel: p.cellCapacityLevel || 0,
          cellSpeedLevel: p.cellSpeedLevel || 0,
          cellSpeedBonus: p.cellSpeedBonus || 0,
          cellStrengthBonus: p.cellStrengthBonus || 0,
          cellMaxHealthBonus: p.cellMaxHealthBonus || 0,
          // Cell abilities
          hasProtector: p.hasProtector || false,
          bubbleShieldActive: p.bubbleShieldActive || false,
          shieldLastCharge: p.shieldLastCharge,
          hasSword: p.hasSword || false,
          hasCellTail: p.hasCellTail || false,
          canHibernate: p.canHibernate || false,
          isFarming: p.isFarming || false,
          // Secondary creatures
          creatures: p.creatures || []
        };
      }

      // If player was marked inactive, clear that
      if (players[targetPlayerId].isInactive) {
        players[targetPlayerId].isInactive = false;
        players[targetPlayerId].inactiveTime = null;
      }

      // Broadcast to all other clients (use targetPlayerId for consistent ID)
      socket.broadcast.emit('playerMoved', {
        id: targetPlayerId,
        x: data.x,
        y: data.y,
        vx: data.vx,
        vy: data.vy
      });

      // Also send to other windows of the same user (multi-window sync)
      const username = socketToUser[socket.id];
      if (username && userSockets[username]) {
        for (const otherSocketId of userSockets[username]) {
          if (otherSocketId !== socket.id) {
            const otherSocket = io.sockets.sockets.get(otherSocketId);
            if (otherSocket) {
              otherSocket.emit('playerMoved', {
                id: targetPlayerId,
                x: data.x,
                y: data.y,
                vx: data.vx,
                vy: data.vy
              });
            }
          }
        }
      }
    }
  });

  // Handle full state sync from client - server stores authoritative state
  socket.on('syncState', (data) => {
    const player = players[socket.id];
    if (!player) return;

    // Sync all state from client (server validates but trusts client for now)
    if (data.health !== undefined) player.health = data.health;
    if (data.maxHealth !== undefined) player.maxHealth = data.maxHealth;
    if (data.food !== undefined) player.food = data.food;
    if (data.nucleotides !== undefined) player.nucleotides = data.nucleotides;
    if (data.type !== undefined) player.type = data.type;
    if (data.radius !== undefined) player.radius = data.radius;
    if (data.hasProtector !== undefined) player.hasProtector = data.hasProtector;
    if (data.hasSword !== undefined) player.hasSword = data.hasSword;
    if (data.bubbleShieldActive !== undefined) player.bubbleShieldActive = data.bubbleShieldActive;

    // Tadpole upgrades
    if (data.healthLevel !== undefined) player.healthLevel = data.healthLevel;
    if (data.strengthLevel !== undefined) player.strengthLevel = data.strengthLevel;
    if (data.capacityLevel !== undefined) player.capacityLevel = data.capacityLevel;
    if (data.maxHealthBonus !== undefined) player.maxHealthBonus = data.maxHealthBonus;
    if (data.strengthBonus !== undefined) player.strengthBonus = data.strengthBonus;

    // Cell upgrades
    if (data.cellHealthLevel !== undefined) player.cellHealthLevel = data.cellHealthLevel;
    if (data.cellStrengthLevel !== undefined) player.cellStrengthLevel = data.cellStrengthLevel;
    if (data.cellCapacityLevel !== undefined) player.cellCapacityLevel = data.cellCapacityLevel;
    if (data.cellSpeedLevel !== undefined) player.cellSpeedLevel = data.cellSpeedLevel;
    if (data.cellSpeedBonus !== undefined) player.cellSpeedBonus = data.cellSpeedBonus;
    if (data.cellStrengthBonus !== undefined) player.cellStrengthBonus = data.cellStrengthBonus;
    if (data.hasCellTail !== undefined) player.hasCellTail = data.hasCellTail;
    if (data.canHibernate !== undefined) player.canHibernate = data.canHibernate;

    // Sync secondary creatures (for multi-creature system)
    if (data.creatures !== undefined) {
      player.creatures = data.creatures;
      // Debug: log when multiple creatures are synced (for debugging multi-creature visibility)
      if (data.creatures.length > 1) {
        console.log(`Player ${socket.id} synced ${data.creatures.length} creatures:`, data.creatures.map(c => `${c.type}@${Math.round(c.x)},${Math.round(c.y)}`).join(', '));
      }
    }
  });

  // Handle player name change (simplified - connection handler does restoration for logged-in users)
  socket.on('setName', (data) => {
    // Support both old format (string) and new format (object)
    const name = typeof data === 'string' ? data : data.name;
    const isNewRegistration = typeof data === 'object' ? data.isNewRegistration : false;
    const cleanName = name.substring(0, 20); // Limit name length

    // If this socket is already tracked as a secondary, ignore setName
    if (socketToUser[socket.id] && !players[socket.id]) {
      console.log(`setName ignored for secondary socket ${socket.id}`);
      return;
    }

    // Check if there's already an active player with this username (race condition fallback)
    let existingPlayerId = null;
    for (let playerId in players) {
      if (players[playerId].name === cleanName && playerId !== socket.id) {
        existingPlayerId = playerId;
        break;
      }
    }

    if (existingPlayerId) {
      // Another window already has this user - link this socket to that player
      console.log(`setName: User ${cleanName} already active, linking socket ${socket.id} to existing player ${existingPlayerId}`);

      // Remove the duplicate player entry for this socket
      delete players[socket.id];
      io.emit('playerLeft', socket.id);

      // Track this socket as belonging to this username
      if (!userSockets[cleanName]) {
        userSockets[cleanName] = new Set();
      }
      userSockets[cleanName].add(socket.id);
      userSockets[cleanName].add(existingPlayerId);
      socketToUser[socket.id] = cleanName;

      // Send the existing player's position to this new window
      const existingPlayer = players[existingPlayerId];
      socket.emit('restorePosition', {
        x: existingPlayer.x,
        y: existingPlayer.y,
        type: existingPlayer.type,
        radius: existingPlayer.radius
      });
      // Mark this as secondary for the client
      socket.emit('init', {
        id: existingPlayerId,
        player: existingPlayer,
        isSecondary: true
      });

      return;
    }

    // Check if this user died while inactive (this can happen when logging in without page reload)
    if (userPositions[cleanName]?.diedWhileInactive) {
      console.log(`setName: User ${cleanName} died while inactive - notifying client`);

      // Clear the flag
      delete userPositions[cleanName];
      saveUserPositions();

      // Remove any lingering idle NPCs for this user
      for (let npcId in npcs) {
        const npc = npcs[npcId];
        if (npc.isIdlePlayer && npc.name === cleanName) {
          io.emit('npcDied', { id: npcId, x: npc.x, y: npc.y, radius: npc.radius });
          delete npcs[npcId];
        }
      }

      // Notify the client that they died while inactive
      socket.emit('diedWhileInactive');
      return;
    }

    // Check for idle NPCs to restore from (user logged in without page reload)
    // Find ALL idle NPCs owned by this user
    const userIdleNpcs = [];
    for (let npcId in npcs) {
      const npc = npcs[npcId];
      if (npc.isIdlePlayer && (npc.ownerName === cleanName || npc.name === cleanName)) {
        userIdleNpcs.push({ id: npcId, npc: npc });
      }
    }

    // If this is a NEW registration, delete any stale idle NPCs with this username
    // (they're from a deleted/old account and shouldn't be restored)
    if (isNewRegistration && userIdleNpcs.length > 0) {
      console.log(`setName: New registration - clearing ${userIdleNpcs.length} stale idle NPCs for ${cleanName}`);
      userIdleNpcs.forEach(({ id, npc }) => {
        io.emit('npcDied', { id: id, x: npc.x, y: npc.y, radius: npc.radius });
        delete npcs[id];
      });
      saveIdleNpcs();
      // Don't restore - let them start fresh as a tadpole
    } else if (userIdleNpcs.length > 0) {
      console.log(`setName: Restoring ${userIdleNpcs.length} creatures for ${cleanName}`);

      // Build creatures array for client (include all upgrade data)
      const restoredCreatures = userIdleNpcs.map(({ id, npc }) => ({
        id: npc.originalCreatureId || id,
        x: npc.x,
        y: npc.y,
        type: npc.type,
        radius: npc.radius,
        health: npc.health,
        maxHealth: npc.maxHealth,
        food: npc.food,
        nucleotides: npc.nucleotides || 0,
        angle: npc.angle,
        // Tadpole upgrades
        healthLevel: npc.healthLevel || 0,
        strengthLevel: npc.strengthLevel || 0,
        capacityLevel: npc.capacityLevel || 0,
        maxHealthBonus: npc.maxHealthBonus || 0,
        strengthBonus: npc.strengthBonus || 0,
        // Cell upgrades
        cellHealthLevel: npc.cellHealthLevel || 0,
        cellStrengthLevel: npc.cellStrengthLevel || 0,
        cellCapacityLevel: npc.cellCapacityLevel || 0,
        cellSpeedLevel: npc.cellSpeedLevel || 0,
        cellSpeedBonus: npc.cellSpeedBonus || 0,
        cellStrengthBonus: npc.cellStrengthBonus || 0,
        cellMaxHealthBonus: npc.cellMaxHealthBonus || 0,
        hasProtector: npc.hasProtector || false,
        bubbleShieldActive: npc.bubbleShieldActive || false,
        hasSword: npc.hasSword || false,
        hasCellTail: npc.hasCellTail || false,
        canHibernate: npc.canHibernate || false,
        // Bacteria-specific
        isFarming: npc.isFarming || false
      }));

      // Update player position from first idle NPC
      const firstNpc = userIdleNpcs[0].npc;
      if (players[socket.id]) {
        players[socket.id].x = firstNpc.x;
        players[socket.id].y = firstNpc.y;
        players[socket.id].type = firstNpc.type;
        players[socket.id].radius = firstNpc.radius;
        players[socket.id].name = cleanName;
        players[socket.id].hasProtector = firstNpc.hasProtector || false;
        players[socket.id].bubbleShieldActive = firstNpc.bubbleShieldActive || false;
        players[socket.id].testMode = false; // Always reset test mode on reconnect

        // Send all restored creatures to client
        socket.emit('restoreCreatures', {
          creatures: restoredCreatures
        });
      }

      // Remove all idle NPCs for this user
      userIdleNpcs.forEach(({ id, npc }) => {
        io.emit('npcDied', { id: id, x: npc.x, y: npc.y, radius: npc.radius });
        delete npcs[id];
      });

      // Track socket-to-user mapping
      if (!userSockets[cleanName]) {
        userSockets[cleanName] = new Set();
      }
      userSockets[cleanName].add(socket.id);
      socketToUser[socket.id] = cleanName;

      io.emit('playerUpdated', players[socket.id]);
      return;
    }

    // Fallback: Try to restore from userPositions if no idle NPCs exist
    // This handles the case where server restarted but idle NPCs weren't saved
    const savedState = userPositions[cleanName];
    if (savedState && !savedState.diedWhileInactive && savedState.type) {
      console.log(`setName: Restoring from userPositions for ${cleanName}`);

      if (players[socket.id]) {
        const p = players[socket.id];

        // Restore basic state
        p.x = savedState.x;
        p.y = savedState.y;
        p.type = savedState.type;
        p.radius = savedState.radius || (savedState.type === 'cell' ? 40 : 8);
        p.name = cleanName;
        p.health = savedState.health;
        p.maxHealth = savedState.maxHealth;
        p.food = savedState.food;
        p.nucleotides = savedState.nucleotides || 0;

        // Tadpole upgrades
        p.healthLevel = savedState.healthLevel || 0;
        p.strengthLevel = savedState.strengthLevel || 0;
        p.capacityLevel = savedState.capacityLevel || 0;
        p.maxHealthBonus = savedState.maxHealthBonus || 0;
        p.strengthBonus = savedState.strengthBonus || 0;

        // Cell upgrades
        p.cellHealthLevel = savedState.cellHealthLevel || 0;
        p.cellStrengthLevel = savedState.cellStrengthLevel || 0;
        p.cellCapacityLevel = savedState.cellCapacityLevel || 0;
        p.cellSpeedLevel = savedState.cellSpeedLevel || 0;
        p.cellSpeedBonus = savedState.cellSpeedBonus || 0;
        p.cellStrengthBonus = savedState.cellStrengthBonus || 0;
        p.cellMaxHealthBonus = savedState.cellMaxHealthBonus || 0;

        // Cell abilities
        p.hasProtector = savedState.hasProtector || false;
        p.bubbleShieldActive = savedState.bubbleShieldActive || false;
        p.shieldLastCharge = savedState.shieldLastCharge;
        p.hasSword = savedState.hasSword || false;
        p.hasCellTail = savedState.hasCellTail || false;
        p.canHibernate = savedState.canHibernate || false;
        p.isFarming = savedState.isFarming || false;

        // Secondary creatures
        p.creatures = savedState.creatures || [];

        p.testMode = false;

        // Build creatures array for client restore
        const restoredCreatures = [];

        // First creature is the main one
        restoredCreatures.push({
          id: socket.id,
          x: p.x,
          y: p.y,
          type: p.type,
          radius: p.radius,
          health: p.health,
          maxHealth: p.maxHealth,
          food: p.food,
          nucleotides: p.nucleotides,
          healthLevel: p.healthLevel,
          strengthLevel: p.strengthLevel,
          capacityLevel: p.capacityLevel,
          maxHealthBonus: p.maxHealthBonus,
          strengthBonus: p.strengthBonus,
          cellHealthLevel: p.cellHealthLevel,
          cellStrengthLevel: p.cellStrengthLevel,
          cellCapacityLevel: p.cellCapacityLevel,
          cellSpeedLevel: p.cellSpeedLevel,
          cellSpeedBonus: p.cellSpeedBonus,
          cellStrengthBonus: p.cellStrengthBonus,
          cellMaxHealthBonus: p.cellMaxHealthBonus,
          hasProtector: p.hasProtector,
          bubbleShieldActive: p.bubbleShieldActive,
          hasSword: p.hasSword,
          hasCellTail: p.hasCellTail,
          canHibernate: p.canHibernate,
          isFarming: p.isFarming
        });

        // Add any secondary creatures
        if (savedState.creatures && savedState.creatures.length > 1) {
          for (let i = 1; i < savedState.creatures.length; i++) {
            const c = savedState.creatures[i];
            restoredCreatures.push({
              id: `${socket.id}_creature_${i}`,
              x: c.x,
              y: c.y,
              type: c.type,
              radius: c.radius,
              health: c.health,
              maxHealth: c.maxHealth,
              food: c.food,
              nucleotides: c.nucleotides || 0,
              healthLevel: c.healthLevel || 0,
              strengthLevel: c.strengthLevel || 0,
              capacityLevel: c.capacityLevel || 0,
              maxHealthBonus: c.maxHealthBonus || 0,
              strengthBonus: c.strengthBonus || 0,
              cellHealthLevel: c.cellHealthLevel || 0,
              cellStrengthLevel: c.cellStrengthLevel || 0,
              cellCapacityLevel: c.cellCapacityLevel || 0,
              cellSpeedLevel: c.cellSpeedLevel || 0,
              cellSpeedBonus: c.cellSpeedBonus || 0,
              cellStrengthBonus: c.cellStrengthBonus || 0,
              cellMaxHealthBonus: c.cellMaxHealthBonus || 0,
              hasProtector: c.hasProtector || false,
              bubbleShieldActive: c.bubbleShieldActive || false,
              hasSword: c.hasSword || false,
              hasCellTail: c.hasCellTail || false,
              canHibernate: c.canHibernate || false,
              isFarming: c.isFarming || false
            });
          }
        }

        // Send restored creatures to client
        socket.emit('restoreCreatures', {
          creatures: restoredCreatures
        });

        // Track socket-to-user mapping
        if (!userSockets[cleanName]) {
          userSockets[cleanName] = new Set();
        }
        userSockets[cleanName].add(socket.id);
        socketToUser[socket.id] = cleanName;

        io.emit('playerUpdated', p);
        return;
      }
    }

    // Update the player's name (no restoration - connection handler already did that)
    if (players[socket.id]) {
      players[socket.id].name = cleanName;

      // Track socket-to-user mapping if not already tracked
      if (!socketToUser[socket.id]) {
        if (!userSockets[cleanName]) {
          userSockets[cleanName] = new Set();
        }
        userSockets[cleanName].add(socket.id);
        socketToUser[socket.id] = cleanName;
      }

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

  // Handle food eating - server is authoritative for food counts
  socket.on('eatFood', (foodId) => {
    const foodItem = food[foodId];
    const player = players[socket.id];

    if (foodItem && player) {
      // Remove the food
      delete food[foodId];

      // Increase player score
      player.score = (player.score || 0) + 1;

      // Track food/nucleotides on server (authoritative)
      if (foodItem.type === 'nucleotide') {
        player.nucleotides = Math.min((player.nucleotides || 0) + 1, 1); // Max 1
      } else {
        // Regular food - check capacity
        const foodCapacity = player.type === 'cell' ? 20 : 5; // Basic capacity
        player.food = Math.min((player.food || 0) + 1, foodCapacity);
      }

      // Broadcast food removal to all clients
      io.emit('foodEaten', {
        foodId,
        playerId: socket.id,
        score: player.score,
        food: player.food,
        nucleotides: player.nucleotides
      });

      // NOTE: Do NOT spawn replacement food here - the periodic food density system handles spawning
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

    // Find player - might be this socket or primary socket if this is secondary
    let player = players[socket.id];
    let primarySocketId = socket.id;

    // If no player for this socket, check if it's a secondary window
    if (!player) {
      const username = socketToUser[socket.id];
      if (username && userSockets[username]) {
        // Find the primary socket that has the player
        for (const sockId of userSockets[username]) {
          if (players[sockId]) {
            player = players[sockId];
            primarySocketId = sockId;
            break;
          }
        }
      }
    }

    // Use attacker position if provided, otherwise fall back to player position
    const attackerX = data.attackerX !== undefined ? data.attackerX : player?.x;
    const attackerY = data.attackerY !== undefined ? data.attackerY : player?.y;

    // Debug: log all attack attempts
    console.log(`Attack received: npcId=${data.npcId}, npcExists=${!!npc}, playerExists=${!!player}, isIdlePlayer=${npc?.isIdlePlayer}`);
    console.log(`  Attacker pos: (${attackerX?.toFixed(0)}, ${attackerY?.toFixed(0)}), NPC pos: (${npc?.x?.toFixed(0)}, ${npc?.y?.toFixed(0)})`);

    if (npc && player && attackerX !== undefined && attackerY !== undefined) {
      const dx = npc.x - attackerX;
      const dy = npc.y - attackerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Validate attack range (with some tolerance for latency)
      if (dist < ATTACK_RANGE * 1.5) {
        // Check if this NPC (or idle player) is protected by a bubble shield
        let isProtected = false;
        for (let protectorId in npcs) {
          const protector = npcs[protectorId];
          if (protector.isIdlePlayer && protector.hasProtector && protector.bubbleShieldActive) {
            const shieldRadius = (protector.radius || 20) * 12;
            const shieldDx = npc.x - protector.x;
            const shieldDy = npc.y - protector.y;
            const shieldDist = Math.sqrt(shieldDx * shieldDx + shieldDy * shieldDy);
            if (shieldDist < shieldRadius) {
              isProtected = true;
              console.log(`NPC ${npc.name || npc.id} is protected by ${protector.name}'s bubble shield`);
              break;
            }
          }
        }

        if (isProtected) {
          // Attack is blocked by shield - just broadcast shield hit effect
          io.emit('shieldBlocked', { x: npc.x, y: npc.y });
          return;
        }

        const damage = data.damage || ATTACK_DAMAGE;
        npc.health = Math.max(0, npc.health - damage);
        npc.lastHit = Date.now();

        // Don't provoke idle creatures that are within any shield radius
        // Check if this NPC is protected by any bubble shield (even if damage got through somehow)
        let isWithinAnyShield = false;
        if (npc.isIdlePlayer) {
          for (let protectorId in npcs) {
            const protector = npcs[protectorId];
            if (protector.isIdlePlayer && protector.hasProtector && protector.bubbleShieldActive) {
              const shieldRadius = (protector.radius || 20) * 12;
              const shieldDx = npc.x - protector.x;
              const shieldDy = npc.y - protector.y;
              const shieldDist = Math.sqrt(shieldDx * shieldDx + shieldDy * shieldDy);
              if (shieldDist < shieldRadius) {
                isWithinAnyShield = true;
                break;
              }
            }
          }
        }

        if (!isWithinAnyShield) {
          npc.provoked = true;
          npc.provokedBy = primarySocketId;
        }

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

        // Debug logging
        if (npc.isIdlePlayer) {
          console.log(`Idle player ${npc.name} took ${damage} damage, health: ${npc.health}/${npc.maxHealth}`);
          if (npc.health <= 0) {
            console.log(`Idle player ${npc.name} should die now!`);
          }
        }

        // Check if NPC died
        if (npc.health <= 0) {
          handleNPCDeath(npc);
        }
      } else {
        console.log(`Attack out of range: dist=${dist}, maxRange=${ATTACK_RANGE * 1.5}`);
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
    const targetPlayer = players[data.targetId];
    if (!targetPlayer) {
      console.log(`PvP attack failed: player ${data.targetId} not found`);
      return;
    }

    const damage = data.damage || ATTACK_DAMAGE;

    // Track health on server side
    if (targetPlayer.health === undefined) {
      targetPlayer.health = targetPlayer.type === 'cell' ? 120 : 70; // MAX_HEALTH values
    }
    if (targetPlayer.maxHealth === undefined) {
      targetPlayer.maxHealth = targetPlayer.health;
    }

    // Apply damage on server
    targetPlayer.health = Math.max(0, targetPlayer.health - damage);
    targetPlayer.lastHit = Date.now();

    console.log(`PvP attack: ${socket.id} -> ${data.targetId}, damage: ${damage}, health: ${targetPlayer.health}/${targetPlayer.maxHealth}`);

    // Broadcast damage to all clients so attacker sees feedback
    io.emit('playerDamaged', {
      playerId: data.targetId,
      health: targetPlayer.health,
      maxHealth: targetPlayer.maxHealth,
      damage: damage,
      x: targetPlayer.x,
      y: targetPlayer.y
    });

    // Also forward to target player's client (if active) for knockback
    const targetSocket = io.sockets.sockets.get(data.targetId);
    if (targetSocket) {
      targetSocket.emit('playerAttacked', {
        attackerId: socket.id,
        damage: damage,
        knockbackX: data.knockbackX,
        knockbackY: data.knockbackY
      });
    }

    // Check if player died
    if (targetPlayer.health <= 0) {
      console.log(`Player ${data.targetId} died from PvP`);
      // Mark player as dead - prevents them from being converted to idle NPC on disconnect
      targetPlayer.isDead = true;
      io.emit('otherPlayerDied', {
        playerId: data.targetId,
        x: targetPlayer.x,
        y: targetPlayer.y
      });
      // Reset their health for respawn (but they're still dead until they reload)
      targetPlayer.health = targetPlayer.maxHealth;
    }
  });

  // Handle individual creature death (player still has other creatures)
  socket.on('creatureDied', (data) => {
    console.log(`Creature ${data.creatureId} died for player ${socket.id}, ${data.remainingCreatures} remaining`);

    // Broadcast to other players
    socket.broadcast.emit('otherCreatureDied', {
      playerId: socket.id,
      creatureId: data.creatureId,
      x: data.x,
      y: data.y
    });

    // Clear any NPCs that were targeting this specific creature
    for (let npcId in npcs) {
      const npc = npcs[npcId];
      if (npc.attackTarget === data.creatureId) {
        npc.attackTarget = null;
      }
    }

    // Update player's creatures array on server if it exists
    const player = players[socket.id];
    if (player && player.creatures) {
      player.creatures = player.creatures.filter(c => c.id !== data.creatureId);
    }
  });

  // Handle player death notification (ALL creatures dead)
  socket.on('playerDied', (data) => {
    // Mark player as dead - prevents them from being converted to idle NPC on disconnect
    if (players[socket.id]) {
      players[socket.id].isDead = true;
    }

    // Broadcast to all other players that this player died
    socket.broadcast.emit('otherPlayerDied', {
      playerId: socket.id,
      x: data.x,
      y: data.y
    });

    // Clear saved position so player respawns fresh (virgin tadpole)
    // But preserve diedWhileInactive flag if it exists (meant for another reconnecting user)
    const player = players[socket.id];
    if (player && player.name && !player.name.startsWith('Player')) {
      if (userPositions[player.name]?.diedWhileInactive) {
        console.log(`Preserving diedWhileInactive flag for ${player.name} (another session)`);
      } else {
        console.log(`Clearing saved position for ${player.name} due to death`);
        delete userPositions[player.name];
      }
    }

    // Clear any NPCs that were targeting this player
    for (let npcId in npcs) {
      const npc = npcs[npcId];
      if (npc.provokedBy === socket.id) {
        npc.provoked = false;
        npc.provokedBy = null;
      }
      if (npc.attackTarget === socket.id) {
        npc.attackTarget = null;
      }
    }

    // Reset player state on server
    if (player) {
      player.health = undefined; // Will be reset on next spawn
      player.maxHealth = undefined;
    }
  });

  // Handle player becoming inactive (tab hidden)
  socket.on('playerInactive', (data) => {
    if (players[socket.id]) {
      // Check if user has other active windows - if so, don't mark as inactive
      const username = players[socket.id].name;
      if (username && userSockets[username] && userSockets[username].size > 1) {
        console.log(`Player ${socket.id} tab hidden but user ${username} has ${userSockets[username].size} windows - staying active`);
        return; // Don't mark as inactive - other windows are active
      }

      players[socket.id].isInactive = true;
      players[socket.id].inactiveTime = Date.now();
      // Store all creatures for idle NPC conversion
      if (data && data.creatures && data.creatures.length > 0) {
        players[socket.id].creatures = data.creatures;
      }
      console.log(`Player ${socket.id} is now inactive (tab hidden)`);
    }
  });

  // Handle periodic creature sync from client
  // This keeps server's player.creatures up-to-date for disconnect handling
  socket.on('syncCreatures', (data) => {
    if (players[socket.id] && data && data.creatures && data.creatures.length > 0) {
      const player = players[socket.id];
      player.creatures = data.creatures;
      // Also update primary player stats from first creature
      const primary = data.creatures[0];
      if (primary) {
        player.type = primary.type;
        player.health = primary.health;
        player.maxHealth = primary.maxHealth;
        player.food = primary.food;
        player.nucleotides = primary.nucleotides;
        player.radius = primary.radius;
        player.x = primary.x;
        player.y = primary.y;
        // Tadpole upgrades
        player.healthLevel = primary.healthLevel || 0;
        player.strengthLevel = primary.strengthLevel || 0;
        player.capacityLevel = primary.capacityLevel || 0;
        player.maxHealthBonus = primary.maxHealthBonus || 0;
        player.strengthBonus = primary.strengthBonus || 0;
        // Cell upgrades
        player.cellHealthLevel = primary.cellHealthLevel || 0;
        player.cellStrengthLevel = primary.cellStrengthLevel || 0;
        player.cellCapacityLevel = primary.cellCapacityLevel || 0;
        player.cellSpeedLevel = primary.cellSpeedLevel || 0;
        player.cellSpeedBonus = primary.cellSpeedBonus || 0;
        player.cellStrengthBonus = primary.cellStrengthBonus || 0;
        player.cellMaxHealthBonus = primary.cellMaxHealthBonus || 0;
        // Cell abilities
        player.hasProtector = primary.hasProtector || false;
        player.bubbleShieldActive = primary.bubbleShieldActive || false;
        player.hasSword = primary.hasSword || false;
        player.hasCellTail = primary.hasCellTail || false;
        player.canHibernate = primary.canHibernate || false;
        player.isFarming = primary.isFarming || false;
      }

      // CRITICAL: Also update userPositions immediately so data persists on disconnect
      const playerName = player.name;
      if (playerName && !playerName.startsWith('Player') && !userPositions[playerName]?.diedWhileInactive) {
        userPositions[playerName] = {
          x: primary.x,
          y: primary.y,
          type: player.type || 'tadpole',
          radius: player.radius || 8,
          health: player.health,
          maxHealth: player.maxHealth,
          food: player.food,
          nucleotides: player.nucleotides || 0,
          healthLevel: player.healthLevel || 0,
          strengthLevel: player.strengthLevel || 0,
          capacityLevel: player.capacityLevel || 0,
          maxHealthBonus: player.maxHealthBonus || 0,
          strengthBonus: player.strengthBonus || 0,
          cellHealthLevel: player.cellHealthLevel || 0,
          cellStrengthLevel: player.cellStrengthLevel || 0,
          cellCapacityLevel: player.cellCapacityLevel || 0,
          cellSpeedLevel: player.cellSpeedLevel || 0,
          cellSpeedBonus: player.cellSpeedBonus || 0,
          cellStrengthBonus: player.cellStrengthBonus || 0,
          cellMaxHealthBonus: player.cellMaxHealthBonus || 0,
          hasProtector: player.hasProtector || false,
          bubbleShieldActive: player.bubbleShieldActive || false,
          hasSword: player.hasSword || false,
          hasCellTail: player.hasCellTail || false,
          canHibernate: player.canHibernate || false,
          isFarming: player.isFarming || false,
          creatures: data.creatures.map(c => ({
            x: c.x,
            y: c.y,
            type: c.type,
            radius: c.radius,
            health: c.health,
            maxHealth: c.maxHealth,
            food: c.food,
            nucleotides: c.nucleotides || 0,
            healthLevel: c.healthLevel || 0,
            strengthLevel: c.strengthLevel || 0,
            capacityLevel: c.capacityLevel || 0,
            maxHealthBonus: c.maxHealthBonus || 0,
            strengthBonus: c.strengthBonus || 0,
            cellHealthLevel: c.cellHealthLevel || 0,
            cellStrengthLevel: c.cellStrengthLevel || 0,
            cellCapacityLevel: c.cellCapacityLevel || 0,
            cellSpeedLevel: c.cellSpeedLevel || 0,
            cellSpeedBonus: c.cellSpeedBonus || 0,
            cellStrengthBonus: c.cellStrengthBonus || 0,
            cellMaxHealthBonus: c.cellMaxHealthBonus || 0,
            hasProtector: c.hasProtector || false,
            bubbleShieldActive: c.bubbleShieldActive || false,
            hasSword: c.hasSword || false,
            hasCellTail: c.hasCellTail || false,
            canHibernate: c.canHibernate || false,
            isFarming: c.isFarming || false
          }))
        };
      }
    }
  });

  // Handle player becoming active again (tab visible)
  socket.on('playerActive', () => {
    // If player was converted to NPC, re-add them to players
    if (!players[socket.id]) {
      // First check if another window already has the player for this username
      const username = socketToUser[socket.id];
      if (username) {
        const existingPlayerId = findPlayerByUsername(username);
        if (existingPlayerId && existingPlayerId !== socket.id) {
          // Another window has the player - this socket should be secondary
          console.log(`Player ${socket.id} (${username}) tab visible, but ${existingPlayerId} already has player - becoming secondary`);

          // Track this socket as belonging to this user
          if (!userSockets[username]) {
            userSockets[username] = new Set();
          }
          userSockets[username].add(socket.id);
          userSockets[username].add(existingPlayerId);

          // Send the existing player's data to this window
          const existingPlayer = players[existingPlayerId];
          socket.emit('init', {
            id: existingPlayerId,
            player: existingPlayer,
            isSecondary: true
          });
          socket.emit('players', players);
          socket.emit('food', food);
          socket.emit('npcs', npcs);
          return; // Don't create a new player
        }
      }

      console.log(`Player ${socket.id} tab became visible, re-adding to players`);

      // Find ALL NPCs that belong to this player (they have IDs like ${socket.id}_creature_0)
      const playerNpcs = [];
      for (let npcId in npcs) {
        if (npcId === socket.id || npcId.startsWith(`${socket.id}_creature_`)) {
          playerNpcs.push({ id: npcId, npc: npcs[npcId] });
        }
      }

      if (playerNpcs.length > 0) {
        console.log(`Found ${playerNpcs.length} NPCs for player ${socket.id}`);
        // Use the first NPC for primary player state
        const firstNpc = playerNpcs[0].npc;

        // Build creatures array from all NPCs
        const creatures = playerNpcs.map(({ id, npc }) => ({
          id: npc.originalCreatureId || id,
          x: npc.x,
          y: npc.y,
          type: npc.type,
          radius: npc.radius,
          health: npc.health,
          maxHealth: npc.maxHealth,
          food: npc.food,
          nucleotides: npc.nucleotides || 0,
          angle: npc.angle,
          healthLevel: npc.healthLevel || 0,
          strengthLevel: npc.strengthLevel || 0,
          capacityLevel: npc.capacityLevel || 0,
          maxHealthBonus: npc.maxHealthBonus || 0,
          strengthBonus: npc.strengthBonus || 0,
          cellHealthLevel: npc.cellHealthLevel || 0,
          cellStrengthLevel: npc.cellStrengthLevel || 0,
          cellCapacityLevel: npc.cellCapacityLevel || 0,
          cellSpeedLevel: npc.cellSpeedLevel || 0,
          cellSpeedBonus: npc.cellSpeedBonus || 0,
          cellStrengthBonus: npc.cellStrengthBonus || 0,
          hasProtector: npc.hasProtector || false,
          bubbleShieldActive: npc.bubbleShieldActive || false,
          hasSword: npc.hasSword || false,
          hasCellTail: npc.hasCellTail || false,
          canHibernate: npc.canHibernate || false
        }));

        players[socket.id] = {
          id: socket.id,
          x: firstNpc.x,
          y: firstNpc.y,
          vx: firstNpc.vx || 0,
          vy: firstNpc.vy || 0,
          color: firstNpc.type === 'cell' ? '#4a5f7f' : '#FFFFFF',
          radius: firstNpc.radius,
          score: 0,
          name: firstNpc.name || firstNpc.ownerName || `Player${Math.floor(Math.random() * 1000)}`,
          lastMoveTime: Date.now(),
          isIdle: false,
          isInactive: false,
          type: firstNpc.type || 'tadpole',
          food: firstNpc.food || 0,
          angle: firstNpc.angle || 0,
          wiggleOffset: firstNpc.wiggleOffset || Math.random() * Math.PI * 2,
          creatures: creatures
        };

        // Remove ALL NPCs for this player
        playerNpcs.forEach(({ id, npc }) => {
          io.emit('npcDied', { id: id, x: npc.x, y: npc.y, radius: npc.radius });
          delete npcs[id];
        });
      } else {
        // No NPCs found - create fresh player
        const spawnPos = findSafeSpawnPosition();
        players[socket.id] = {
          id: socket.id,
          x: spawnPos.x,
          y: spawnPos.y,
          vx: 0,
          vy: 0,
          color: '#FFFFFF',
          radius: 8,
          score: 0,
          name: `Player${Math.floor(Math.random() * 1000)}`,
          lastMoveTime: Date.now(),
          isIdle: false,
          isInactive: false,
          type: 'tadpole',
          creatures: [] // Initialize creatures array
        };
      }
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
      // When activating shield, check if player has food and charge immediately
      if (data.active && !player.bubbleShieldActive) {
        // Need at least 1 food to activate shield
        if ((player.food || 0) < 1) {
          // Not enough food - deny activation
          socket.emit('shieldDenied', { reason: 'Not enough food' });
          return;
        }
        // Deduct 1 food immediately (first hour)
        player.food = (player.food || 0) - 1;
        player.shieldLastCharge = Date.now();
        // Notify client of food change
        socket.emit('foodUpdate', { food: player.food });
      }

      player.bubbleShieldActive = data.active;
      // Also track per-creature shield state for disconnect handling
      if (!player.creatureShields) {
        player.creatureShields = {};
      }
      if (data.oderId) {
        player.creatureShields[data.oderId] = data.active;
      }
    }
  });

  // Handle protector upgrade state
  socket.on('hasProtector', (data) => {
    const player = players[socket.id];
    if (player) {
      player.hasProtector = data.active;
    }
  });

  // Handle test mode (cheat: NPCs ignore this player)
  socket.on('testMode', (data) => {
    const player = players[socket.id];
    if (player) {
      player.testMode = data.enabled;
      console.log(`Player ${socket.id} test mode: ${data.enabled ? 'ON' : 'OFF'}`);
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
    generateFood(23); // Start with some food (increased 50%)

    // Reinitialize NPCs using server's NPC system
    initializeNPCs();

    // Broadcast reset to all clients
    io.emit('worldReset', { food, npcs });

    console.log('World reset complete - regenerated food and NPCs');
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const username = socketToUser[socket.id];
    const isPrimarySocket = !!players[socket.id]; // This socket owns a player entry
    console.log('Player disconnected:', socket.id, username ? `(${username})` : '(anonymous)', isPrimarySocket ? '[PRIMARY]' : '[secondary]');

    // Clean up socket tracking
    if (username && userSockets[username]) {
      userSockets[username].delete(socket.id);

      // If this is a SECONDARY socket disconnecting and primary still exists, just clean up tracking
      if (!isPrimarySocket && userSockets[username].size > 0) {
        console.log(`Secondary socket closed, user ${username} still has ${userSockets[username].size} window(s) open`);
        delete socketToUser[socket.id];
        return;
      }

      // If no more sockets for this user, clean up the Set
      if (userSockets[username].size === 0) {
        delete userSockets[username];
      }
    }
    delete socketToUser[socket.id];

    // Check if player was already converted to idle NPC - if so, keep the NPC
    if (npcs[socket.id] && npcs[socket.id].isIdlePlayer) {
      console.log(`Player ${socket.id} disconnected but their idle NPC remains`);
      // Don't emit playerLeft - the idle NPC should persist
      delete players[socket.id];
    } else if (players[socket.id]) {
      // PRIMARY socket disconnecting
      const player = players[socket.id];

      // Check if user has other windows still open
      if (username && userSockets[username] && userSockets[username].size > 0) {
        // Transfer player ownership to a remaining socket
        const remainingSockets = Array.from(userSockets[username]);
        const newPrimarySocketId = remainingSockets[0];
        console.log(`Primary socket ${socket.id} disconnected, transferring player to ${newPrimarySocketId}`);

        // Update the player's ID to the new socket ID
        players[newPrimarySocketId] = player;
        players[newPrimarySocketId].id = newPrimarySocketId;
        delete players[socket.id];

        // Notify all remaining sockets about the new primary
        remainingSockets.forEach(sockId => {
          const sock = io.sockets.sockets.get(sockId);
          if (sock) {
            sock.emit('primaryChanged', { newPrimaryId: newPrimarySocketId });
          }
        });
        return;
      }

      // No other windows - convert to idle NPC
      // Only convert if they have a real username (not anonymous) AND they're not dead
      if (player.name && !player.name.startsWith('Player') && !player.isDead) {
        console.log(`Converting disconnecting player ${socket.id} (${player.name}) to idle NPC`);
        convertPlayerToNPC(socket.id, player, 'disconnected');
        // Don't emit playerLeft - they're now an idle NPC
      } else {
        // Anonymous player or dead player - just remove them
        if (player.isDead) {
          console.log(`Dead player ${socket.id} (${player.name}) disconnected - not converting to NPC`);
        }
        delete players[socket.id];
        io.emit('playerLeft', socket.id);
      }
    } else {
      // Player doesn't exist - secondary socket or already cleaned up
      if (!username) {
        delete npcs[socket.id];
        io.emit('playerLeft', socket.id);
      }
    }
  });
});

// Convert all active players to idle NPCs (for graceful shutdown)
function convertAllPlayersToIdleNpcs() {
  const playerIds = Object.keys(players);
  console.log(`Converting ${playerIds.length} active players to idle NPCs for shutdown...`);

  for (const playerId of playerIds) {
    const player = players[playerId];
    if (!player || !player.name || player.name.startsWith('Player')) continue;

    // Create idle NPC from player
    const npc = {
      id: playerId,
      x: player.x,
      y: player.y,
      vx: 0,
      vy: 0,
      color: player.color || '#a0a0a0',
      radius: player.radius || 8,
      name: player.name,
      ownerName: player.name,
      health: player.health || 70,
      maxHealth: player.maxHealth || 70,
      lastHit: 0,
      lastAttack: 0,
      type: player.type || 'tadpole',
      moveTarget: null,
      targetChangeTime: Date.now(),
      provoked: false,
      provokedBy: null,
      attackTarget: null,
      food: player.food || 0,
      nucleotides: player.nucleotides || 0,
      angle: player.angle || 0,
      wiggleOffset: player.wiggleOffset || Math.random() * Math.PI * 2,
      chaseEnergy: 100,
      maxChaseEnergy: 100,
      isTired: false,
      tiredStartTime: 0,
      isSprinting: false,
      isIdlePlayer: true,
      // Tadpole upgrades
      healthLevel: player.healthLevel || 0,
      strengthLevel: player.strengthLevel || 0,
      capacityLevel: player.capacityLevel || 0,
      maxHealthBonus: player.maxHealthBonus || 0,
      strengthBonus: player.strengthBonus || 0,
      // Cell upgrades
      cellHealthLevel: player.cellHealthLevel || 0,
      cellStrengthLevel: player.cellStrengthLevel || 0,
      cellCapacityLevel: player.cellCapacityLevel || 0,
      cellSpeedLevel: player.cellSpeedLevel || 0,
      cellSpeedBonus: player.cellSpeedBonus || 0,
      cellStrengthBonus: player.cellStrengthBonus || 0,
      hasProtector: player.hasProtector || false,
      hasSword: player.hasSword || false,
      hasCellTail: player.hasCellTail || false,
      canHibernate: player.canHibernate || false,
      bubbleShieldActive: player.bubbleShieldActive || false,
      lastMoveTime: Date.now()
    };

    npcs[playerId] = npc;

    // Save full state for persistence
    if (player.name) {
      userPositions[player.name] = {
        x: player.x,
        y: player.y,
        type: player.type || 'tadpole',
        radius: player.radius || 8,
        // State
        health: player.health,
        maxHealth: player.maxHealth,
        food: player.food,
        nucleotides: player.nucleotides || 0,
        // Tadpole upgrades
        healthLevel: player.healthLevel || 0,
        strengthLevel: player.strengthLevel || 0,
        capacityLevel: player.capacityLevel || 0,
        maxHealthBonus: player.maxHealthBonus || 0,
        strengthBonus: player.strengthBonus || 0,
        // Cell upgrades
        cellHealthLevel: player.cellHealthLevel || 0,
        cellStrengthLevel: player.cellStrengthLevel || 0,
        cellCapacityLevel: player.cellCapacityLevel || 0,
        cellSpeedLevel: player.cellSpeedLevel || 0,
        cellSpeedBonus: player.cellSpeedBonus || 0,
        cellStrengthBonus: player.cellStrengthBonus || 0,
        cellMaxHealthBonus: player.cellMaxHealthBonus || 0,
        // Cell abilities
        hasProtector: player.hasProtector || false,
        bubbleShieldActive: player.bubbleShieldActive || false,
        shieldLastCharge: player.shieldLastCharge,
        hasSword: player.hasSword || false,
        hasCellTail: player.hasCellTail || false,
        canHibernate: player.canHibernate || false,
        isFarming: player.isFarming || false,
        // Secondary creatures
        creatures: player.creatures || []
      };
    }

    console.log(`  Converted player ${player.name} to idle NPC`);
  }
}

// Graceful shutdown
let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    console.log('Already shutting down...');
    return;
  }
  isShuttingDown = true;

  console.log(`${signal} received, saving data and shutting down...`);
  console.log(`Current state: ${Object.keys(players).length} players, ${Object.keys(npcs).filter(id => npcs[id].isIdlePlayer).length} idle NPCs`);

  // Convert all active players to idle NPCs first
  convertAllPlayersToIdleNpcs();
  console.log(`After conversion: ${Object.keys(npcs).filter(id => npcs[id].isIdlePlayer).length} idle NPCs`);

  // Save all data
  try {
    console.log('Saving all data...');
    await Promise.all([savePlayers(), saveUserPositions(), saveIdleNpcs()]);
    console.log('All data saved successfully');
  } catch (error) {
    console.error('Error during save:', error);
  }

  // Close server
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });

  // Force exit after 5 seconds if server doesn't close gracefully
  setTimeout(() => {
    console.log('Forcing exit after timeout');
    process.exit(0);
  }, 5000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

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

// Helper function to convert a player to an NPC on the server
function convertPlayerToNPC(playerId, player, reason) {
  console.log(`Converting player ${playerId} (${player.name}) to idle NPC (${reason})`);

  // Remove any existing idle NPCs with the same username to prevent duplicates
  if (player.name) {
    for (let npcId in npcs) {
      const existingNpc = npcs[npcId];
      if (existingNpc.isIdlePlayer && existingNpc.ownerName === player.name) {
        console.log(`Removing duplicate idle NPC for ${player.name}: ${npcId}`);
        io.emit('npcDied', { id: npcId, x: existingNpc.x, y: existingNpc.y, radius: existingNpc.radius });
        delete npcs[npcId];
      }
    }
  }

  // Check if player has multiple creatures
  // Fallback: if player.creatures is empty/small but userPositions has more creatures, use those
  let creatures = player.creatures || [];
  if (player.name && userPositions[player.name]?.creatures) {
    const savedCreatures = userPositions[player.name].creatures;
    if (savedCreatures.length > creatures.length) {
      console.log(`Using ${savedCreatures.length} creatures from userPositions (player had ${creatures.length})`);
      creatures = savedCreatures;
    }
  }
  const createdNpcs = [];

  if (creatures.length > 0) {
    // Create idle NPCs for all creatures
    creatures.forEach((creature, index) => {
      const npcId = `${playerId}_creature_${index}`;
      const isCell = creature.type === 'cell';
      const isBacteria = creature.type === 'bacteria';

      // Determine type-specific defaults
      let defaultRadius = NPC_TADPOLE_RADIUS;
      let defaultHealth = NPC_TADPOLE_HEALTH;
      if (isCell) {
        defaultRadius = NPC_CELL_RADIUS;
        defaultHealth = NPC_CELL_HEALTH;
      } else if (isBacteria) {
        defaultRadius = 18; // BACTERIA_RADIUS
        defaultHealth = 60; // BACTERIA_MAX_HEALTH
      }

      const npc = {
        id: npcId,
        x: creature.x,
        y: creature.y,
        vx: 0,
        vy: 0,
        color: '#a0a0a0',
        radius: creature.radius || defaultRadius,
        name: creature.name || player.name || '',
        ownerName: player.name || '', // Track which user owns this creature
        health: creature.health || defaultHealth,
        maxHealth: creature.maxHealth || defaultHealth,
        lastHit: 0,
        lastAttack: 0,
        type: creature.type || 'tadpole',
        moveTarget: null,
        targetChangeTime: Date.now(),
        provoked: false,
        provokedBy: null,
        attackTarget: null,
        food: creature.food || 0,
        nucleotides: creature.nucleotides || 0,
        angle: creature.angle || 0,
        wiggleOffset: Math.random() * Math.PI * 2,
        chaseEnergy: 100,
        maxChaseEnergy: 100,
        isTired: false,
        tiredStartTime: 0,
        isSprinting: false,
        isIdlePlayer: true,
        // Tadpole upgrades
        healthLevel: creature.healthLevel || 0,
        strengthLevel: creature.strengthLevel || 0,
        capacityLevel: creature.capacityLevel || 0,
        maxHealthBonus: creature.maxHealthBonus || 0,
        strengthBonus: creature.strengthBonus || 0,
        // Cell upgrades
        cellHealthLevel: creature.cellHealthLevel || 0,
        cellStrengthLevel: creature.cellStrengthLevel || 0,
        cellCapacityLevel: creature.cellCapacityLevel || 0,
        cellSpeedLevel: creature.cellSpeedLevel || 0,
        cellSpeedBonus: creature.cellSpeedBonus || 0,
        cellStrengthBonus: creature.cellStrengthBonus || 0,
        hasProtector: creature.hasProtector || false,
        bubbleShieldActive: creature.bubbleShieldActive || false,
        hasSword: creature.hasSword || false,
        hasCellTail: creature.hasCellTail || false,
        canHibernate: creature.canHibernate || false,
        // Bacteria-specific
        isFarming: creature.isFarming || false,
        originalCreatureId: creature.id // Track original ID for restoration
      };

      npcs[npcId] = npc;
      createdNpcs.push(npc);
    });

    console.log(`Created ${createdNpcs.length} idle NPCs for ${player.name}`);
  } else {
    // Fallback: create single NPC from player data
    // Use actual player values when available, fall back to defaults only if missing
    const wasCell = player.type === 'cell';
    const isBacteria = player.type === 'bacteria';
    let defaultRadius = NPC_TADPOLE_RADIUS;
    let defaultHealth = NPC_TADPOLE_HEALTH;
    if (wasCell) {
      defaultRadius = NPC_CELL_RADIUS;
      defaultHealth = NPC_CELL_HEALTH;
    } else if (isBacteria) {
      defaultRadius = 18;
      defaultHealth = 60;
    }
    const npc = {
      id: playerId,
      x: player.x,
      y: player.y,
      vx: 0,
      vy: 0,
      color: '#a0a0a0',
      radius: player.radius || defaultRadius,
      name: player.name || '',
      ownerName: player.name || '',
      health: player.health || defaultHealth,
      maxHealth: player.maxHealth || defaultHealth,
      lastHit: 0,
      lastAttack: 0,
      type: player.type || 'tadpole',
      moveTarget: null,
      targetChangeTime: Date.now(),
      provoked: false,
      provokedBy: null,
      attackTarget: null,
      food: player.food || 0,
      nucleotides: player.nucleotides || 0,
      angle: player.angle || 0,
      wiggleOffset: player.wiggleOffset || Math.random() * Math.PI * 2,
      chaseEnergy: 100,
      maxChaseEnergy: 100,
      isTired: false,
      tiredStartTime: 0,
      isSprinting: false,
      isIdlePlayer: true,
      // Tadpole upgrades
      healthLevel: player.healthLevel || 0,
      strengthLevel: player.strengthLevel || 0,
      capacityLevel: player.capacityLevel || 0,
      maxHealthBonus: player.maxHealthBonus || 0,
      strengthBonus: player.strengthBonus || 0,
      // Cell upgrades
      cellHealthLevel: player.cellHealthLevel || 0,
      cellStrengthLevel: player.cellStrengthLevel || 0,
      cellCapacityLevel: player.cellCapacityLevel || 0,
      cellSpeedLevel: player.cellSpeedLevel || 0,
      cellSpeedBonus: player.cellSpeedBonus || 0,
      cellStrengthBonus: player.cellStrengthBonus || 0,
      cellMaxHealthBonus: player.cellMaxHealthBonus || 0,
      hasProtector: player.hasProtector || false,
      hasSword: player.hasSword || false,
      hasCellTail: player.hasCellTail || false,
      canHibernate: player.canHibernate || false,
      bubbleShieldActive: player.bubbleShieldActive || false,
      isFarming: player.isFarming || false
    };

    npcs[playerId] = npc;
    createdNpcs.push(npc);
  }

  // Save full state for persistence
  if (createdNpcs.length > 0 && player.name && !player.name.startsWith('Player') && !userPositions[player.name]?.diedWhileInactive) {
    const firstNpc = createdNpcs[0];
    userPositions[player.name] = {
      x: firstNpc.x,
      y: firstNpc.y,
      type: firstNpc.type || 'tadpole',
      radius: firstNpc.radius || 8,
      // State
      health: firstNpc.health,
      maxHealth: firstNpc.maxHealth,
      food: firstNpc.food,
      nucleotides: firstNpc.nucleotides || 0,
      // Tadpole upgrades
      healthLevel: firstNpc.healthLevel || 0,
      strengthLevel: firstNpc.strengthLevel || 0,
      capacityLevel: firstNpc.capacityLevel || 0,
      maxHealthBonus: firstNpc.maxHealthBonus || 0,
      strengthBonus: firstNpc.strengthBonus || 0,
      // Cell upgrades
      cellHealthLevel: firstNpc.cellHealthLevel || 0,
      cellStrengthLevel: firstNpc.cellStrengthLevel || 0,
      cellCapacityLevel: firstNpc.cellCapacityLevel || 0,
      cellSpeedLevel: firstNpc.cellSpeedLevel || 0,
      cellSpeedBonus: firstNpc.cellSpeedBonus || 0,
      cellStrengthBonus: firstNpc.cellStrengthBonus || 0,
      cellMaxHealthBonus: firstNpc.cellMaxHealthBonus || 0,
      // Cell abilities
      hasProtector: firstNpc.hasProtector || false,
      bubbleShieldActive: firstNpc.bubbleShieldActive || false,
      shieldLastCharge: player.shieldLastCharge,
      hasSword: firstNpc.hasSword || false,
      hasCellTail: firstNpc.hasCellTail || false,
      canHibernate: firstNpc.canHibernate || false,
      isFarming: firstNpc.isFarming || false,
      // All creatures for this player
      creatures: createdNpcs.map(npc => ({
        x: npc.x,
        y: npc.y,
        type: npc.type,
        radius: npc.radius,
        health: npc.health,
        maxHealth: npc.maxHealth,
        food: npc.food,
        nucleotides: npc.nucleotides || 0,
        healthLevel: npc.healthLevel || 0,
        strengthLevel: npc.strengthLevel || 0,
        capacityLevel: npc.capacityLevel || 0,
        maxHealthBonus: npc.maxHealthBonus || 0,
        strengthBonus: npc.strengthBonus || 0,
        cellHealthLevel: npc.cellHealthLevel || 0,
        cellStrengthLevel: npc.cellStrengthLevel || 0,
        cellCapacityLevel: npc.cellCapacityLevel || 0,
        cellSpeedLevel: npc.cellSpeedLevel || 0,
        cellSpeedBonus: npc.cellSpeedBonus || 0,
        cellStrengthBonus: npc.cellStrengthBonus || 0,
        cellMaxHealthBonus: npc.cellMaxHealthBonus || 0,
        hasProtector: npc.hasProtector || false,
        bubbleShieldActive: npc.bubbleShieldActive || false,
        hasSword: npc.hasSword || false,
        hasCellTail: npc.hasCellTail || false,
        canHibernate: npc.canHibernate || false,
        isFarming: npc.isFarming || false
      }))
    };
  }

  // Notify clients
  io.emit('playerIdle', {
    id: playerId,
    player: player,
    creatures: createdNpcs,
    isIdlePlayer: true
  });

  // Remove from players
  delete players[playerId];
}

// Check for inactive players (tab hidden) and convert them to NPCs
// Only converts when tab is hidden, NOT when player stops moving
setInterval(() => {
  const now = Date.now();
  const inactiveTimeout = 3000; // 3 seconds with tab hidden

  for (let playerId in players) {
    const player = players[playerId];

    // Convert inactive players (tab hidden) to idle NPCs - but not dead players
    if (player.isInactive && player.inactiveTime && now - player.inactiveTime > inactiveTimeout && !player.isDead) {
      convertPlayerToNPC(playerId, player, 'tab hidden');
    }
  }
}, 2000); // Check every 2 seconds

// Start server
Promise.all([loadPlayers(), loadUserPositions(), loadIdleNpcs()]).then(() => {
  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);

    // Broadcast food reset to all connected clients (if any)
    io.emit('foodReset', food);
  });
});
