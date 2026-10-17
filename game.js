
"use strict";

/* ATTACKE PINGUIN — Online-Spiel für bis zu 10 Spieler */

const MAX_PLAYERS = 10;
const VIEW_W = 960;
const VIEW_H = 600;

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const mini = document.getElementById("minimap");
const mctx = mini.getContext("2d");

const menu = document.getElementById("menu");
const gamePanel = document.getElementById("gamePanel");
const nameInput = document.getElementById("playerName");
const roomInput = document.getElementById("roomInput");
const menuMessage = document.getElementById("menuMessage");
const roomLabel = document.getElementById("roomLabel");
const connectionLabel = document.getElementById("connectionLabel");
const notice = document.getElementById("notice");
const playerList = document.getElementById("playerList");

const levelStat = document.getElementById("levelStat");
const snowStat = document.getElementById("snowStat");
const playersStat = document.getElementById("playersStat");
const enemiesStat = document.getElementById("enemiesStat");

let peer = null;
let hostConnection = null;
let connections = new Map();
let pendingConnections = new Set();

let isHost = false;
let online = false;
let running = false;
let gameOver = false;
let roomCode = "";
let localId = "";

let lastFrame = 0;
let lastSnapshot = 0;
let lastInputSend = 0;
let noticeUntil = 0;
let joiningSent = false;
let joinedGame = false;
let enemyId = 1;
let lastSpawn = 0;

const keys = {};
const mouse = { x: VIEW_W / 2 + 100, y: VIEW_H / 2, down: false };
const touch = { x: 0, y: 0, shooting: false };

const world = {
  width: 1800,
  height: 1400,
  level: 1,
  players: [],
  enemies: [],
  snowballs: [],
  walls: [],
  houses: [],
  shots: []
};

const camera = { x: 0, y: 0 };

function random(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function makeId(prefix = "p") {
  return prefix + Math.random().toString(36).slice(2, 9);
}

function getName() {
  return (nameInput.value || "Pinguin").trim().slice(0, 16) || "Pinguin";
}

function notify(text, duration = 2500) {
  notice.textContent = text;
  noticeUntil = performance.now() + duration;
}

function menuStatus(text) {
  menuMessage.textContent = text;
}

function resetWorld() {
  world.width = 1800;
  world.height = 1400;
  world.level = 1;
  world.players = [];
  world.enemies = [];
  world.snowballs = [];
  world.walls = [];
  world.houses = [];
  world.shots = [];

  enemyId = 1;
  lastSpawn = 0;
  gameOver = false;
  joinedGame = false;
  joiningSent = false;
}

function makePlayer(id, name, x, y, local = false) {
  return {
    id,
    name,
    x,
    y,
    r: 17,
    speed: 220,
    angle: 0,
    hp: 100,
    snow: 15,
    alive: true,
    isLocal: local,
    input: {
      dx: 0,
      dy: 0,
      aimX: 1,
      aimY: 0,
      shoot: false,
      wall: false,
      house: false
    },
    lastShot: 0,
    lastWall: 0,
    lastHouse: 0
  };
}

function closeNetwork() {
  if (hostConnection) {
    try {
      hostConnection.close();
    } catch (_) {}
  }

  hostConnection = null;

  for (const conn of connections.values()) {
    try {
      conn.close();
    } catch (_) {}
  }

  for (const conn of pendingConnections) {
    try {
      conn.close();
    } catch (_) {}
  }

  connections.clear();
  pendingConnections.clear();

  if (peer) {
    try {
      peer.destroy();
    } catch (_) {}
  }

  peer = null;
  online = false;
  isHost = false;
  joinedGame = false;
}

function returnToMenu() {
  running = false;
  closeNetwork();
  gamePanel.classList.add("hidden");
  menu.classList.remove("hidden");
}

function startGame() {
  if (running) return;

  running = true;
  joinedGame = true;

  menu.classList.add("hidden");
  gamePanel.classList.remove("hidden");

  roomLabel.textContent = online ? "Raum: " + roomCode : "Solo-Spiel";
  connectionLabel.textContent = online
    ? (isHost ? "Host · maximal 10 Spieler" : "Mit Host verbunden")
    : "Offline-Spiel";

  lastFrame = performance.now();
  notify(
    online
      ? "Gemeinsame Partie gestartet. Raumcode: " + roomCode
      : "Sammle Schneebälle und besiege die Gegner!"
  );

  requestAnimationFrame(gameLoop);
}

/* -------------------- PeerJS-Verbindung -------------------- */

function createPeer(id) {
  return new Promise((resolve, reject) => {
    if (typeof Peer === "undefined") {
      reject(new Error("PeerJS konnte nicht geladen werden."));
      return;
    }

    const newPeer = new Peer(id, { debug: 0 });
    let opened = false;

    const timeout = setTimeout(() => {
      if (!opened) {
        try {
          newPeer.destroy();
        } catch (_) {}
        reject(new Error("Zeitüberschreitung beim Verbinden."));
      }
    }, 15000);

    newPeer.on("open", () => {
      opened = true;
      clearTimeout(timeout);
      peer = newPeer;
      resolve(newPeer);
    });

    newPeer.on("error", err => {
      if (!opened) {
        clearTimeout(timeout);
        reject(err);
      } else {
        console.error("PeerJS:", err);
      }
    });

    newPeer.on("disconnected", () => {
      if (running && online) {
        connectionLabel.textContent = "Verbindung unterbrochen";
      }
    });
  });
}

function createRoomCode() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

async function createOnlineRoom() {
  closeNetwork();
  resetWorld();

  isHost = true;
  online = true;
  roomCode = createRoomCode();
  localId = makeId("host-");

  menuStatus("Online-Raum wird erstellt ...");

  try {
    await createPeer("ap-" + roomCode.toLowerCase());

    world.players.push(
      makePlayer(localId, getName(), 220, 220, true)
    );

    peer.on("connection", handleIncomingConnection);

    startGame();
    notify("Dein Raumcode: " + roomCode, 7000);
  } catch (error) {
    closeNetwork();
    menuStatus(
      "Raum konnte nicht erstellt werden. Bitte erneut versuchen."
    );
    console.error(error);
  }
}

/*
 * Der Host nimmt höchstens neun Mitspieler auf.
 * Zusammen mit dem Host sind das maximal zehn Spieler.
 */
function handleIncomingConnection(conn) {
  const currentConnections =
    connections.size + pendingConnections.size;

  if (currentConnections >= MAX_PLAYERS - 1) {
    conn.on("open", () => {
      try {
        conn.send({
          type: "full",
          message: "Der Raum ist voll. Maximal 10 Spieler."
        });
      } catch (_) {}

      setTimeout(() => {
        try {
          conn.close();
        } catch (_) {}
      }, 300);
    });
    return;
  }

  pendingConnections.add(conn);

  conn.on("open", () => {
    pendingConnections.delete(conn);
    connections.set(conn.peer, conn);

    /*
     * Wichtig: Hier wird noch kein Spieler erzeugt.
     * Erst die join-Nachricht erzeugt genau einen Spieler.
     */
    conn.send({
      type: "welcome",
      room: roomCode,
      maxPlayers: MAX_PLAYERS
    });
  });

  conn.on("data", data => {
    if (!data || typeof data !== "object") return;

    if (data.type === "join") {
      handlePlayerJoin(conn, data);
      return;
    }

    if (data.type === "input" && conn.playerId) {
      const player = world.players.find(
        p => p.id === conn.playerId
      );

      if (!player) return;

      player.input = sanitizeInput(data.input);
      player.name = String(data.name || player.name).slice(0, 16);
      return;
    }

    if (data.type === "build" && conn.playerId) {
      const player = world.players.find(
        p => p.id === conn.playerId
      );

      if (!player || !player.alive) return;

      if (data.building === "wall") {
        buildStructure(player, "wall");
      } else if (data.building === "house") {
        buildStructure(player, "house");
      }
      return;
    }

    if (data.type === "leave" && conn.playerId) {
      removePlayer(conn.playerId);
      conn.playerId = null;
    }
  });

  conn.on("close", () => {
    pendingConnections.delete(conn);
    connections.delete(conn.peer);

    if (conn.playerId) {
      removePlayer(conn.playerId);
      conn.playerId = null;
    }
  });

  conn.on("error", () => {
    pendingConnections.delete(conn);
    connections.delete(conn.peer);

    if (conn.playerId) {
      removePlayer(conn.playerId);
      conn.playerId = null;
    }
  });
}

function handlePlayerJoin(conn, data) {
  // Verhindert, dass ein Client mehrere Spieler erzeugt.
  if (conn.playerId) {
    sendSnapshotTo(conn);
    return;
  }

  if (world.players.length >= MAX_PLAYERS) {
    try {
      conn.send({
        type: "full",
        message: "Der Raum ist voll. Maximal 10 Spieler."
      });
    } catch (_) {}
    return;
  }

  const id = makeId("guest-");

  const player = makePlayer(
    id,
    String(data.name || "Pinguin").slice(0, 16),
    random(100, world.width - 100),
    random(100, world.height - 100),
    false
  );

  conn.playerId = id;
  world.players.push(player);

  // Erst ID senden, dann den aktuellen Spielstand übertragen.
  conn.send({
    type: "joined",
    id,
    room: roomCode,
    maxPlayers: MAX_PLAYERS
  });

  broadcastSnapshot();
}

function sanitizeInput(input) {
  if (!input || typeof input !== "object") {
    return {
      dx: 0, dy: 0, aimX: 1, aimY: 0,
      shoot: false, wall: false, house: false
    };
  }

  return {
    dx: clamp(Number(input.dx) || 0, -1, 1),
    dy: clamp(Number(input.dy) || 0, -1, 1),
    aimX: clamp(Number(input.aimX) || 0, -1, 1),
    aimY: clamp(Number(input.aimY) || 0, -1, 1),
    shoot: !!input.shoot,
    wall: !!input.wall,
    house: !!input.house
  };
}

async function joinOnlineRoom() {
  const code = roomInput.value.trim().toUpperCase();

  if (!/^[A-Z0-9]{5}$/.test(code)) {
    menuStatus("Gib den fünfstelligen Raumcode ein.");
    return;
  }

  closeNetwork();
  resetWorld();

  isHost = false;
  online = true;
  roomCode = code;
  localId = "";

  menuStatus("Verbinde mit Raum " + code + " ...");

  try {
    /*
     * Jeder Mitspieler erhält eine eigene Peer-ID.
     * Die Verbindung zum Host wird danach geöffnet.
     */
    await createPeer(makeId("client-"));

    hostConnection = peer.connect(
      "ap-" + code.toLowerCase(),
      { reliable: true }
    );

    /*
     * Wichtig: Daten-Listener werden VOR dem Warten auf open
     * registriert. Dadurch wird die welcome-Nachricht nicht verpasst.
     */
    hostConnection.on("data", data => {
      if (!data || typeof data !== "object") return;

      if (data.type === "full") {
        menuStatus(data.message || "Der Raum ist voll.");
        returnToMenu();
        return;
      }

      if (data.type === "welcome") {
        if (!joiningSent) {
          joiningSent = true;
          hostConnection.send({
            type: "join",
            name: getName()
          });
        }
        return;
      }

      if (data.type === "joined") {
        localId = data.id;
        roomCode = data.room || roomCode;

        startGame();
        notify("Du bist der Gruppe beigetreten.");
        return;
      }

      if (data.type === "snapshot") {
        applySnapshot(data.world);
      }
    });

    hostConnection.on("open", () => {
      connectionLabel.textContent = "Verbindung hergestellt";
    });

    hostConnection.on("close", () => {
      if (running) {
        connectionLabel.textContent = "Verbindung zum Host verloren";
        notify("Die Verbindung zum Host wurde getrennt.", 6000);
      }
    });

    hostConnection.on("error", error => {
      console.error("Host-Verbindung:", error);
      menuStatus("Verbindung fehlgeschlagen. Prüfe den Raumcode.");
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Host nicht erreichbar.")),
        15000
      );

      hostConnection.on("open", () => {
        clearTimeout(timeout);
        resolve(true);
      });

      hostConnection.on("error", error => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  } catch (error) {
    console.error(error);
    closeNetwork();
    menuStatus(
      "Beitritt fehlgeschlagen. Prüfe den Code und ob der Host noch spielt."
    );
  }
}

/* -------------------- Synchronisierung -------------------- */

function removePlayer(id) {
  world.players = world.players.filter(p => p.id !== id);
  broadcastSnapshot();
}

function makeSnapshot() {
  return {
    width: world.width,
    height: world.height,
    level: world.level,

    players: world.players.map(p => ({
      id: p.id,
      name: p.name,
      x: p.x,
      y: p.y,
      r: p.r,
      angle: p.angle,
      hp: p.hp,
      snow: p.snow,
      alive: p.alive
    })),

    enemies: world.enemies,
    snowballs: world.snowballs,
    walls: world.walls,
    houses: world.houses,
    shots: world.shots
  };
}

function sendSnapshotTo(conn) {
  if (!conn || !conn.open) return;

  try {
    conn.send({
      type: "snapshot",
      world: makeSnapshot()
    });
  } catch (error) {
    console.error("Snapshot konnte nicht gesendet werden:", error);
  }
}

function broadcastSnapshot() {
  if (!isHost || !online) return;

  for (const conn of connections.values()) {
    sendSnapshotTo(conn);
  }
}

function applySnapshot(data) {
  if (!data) return;

  world.width = data.width;
  world.height = data.height;
  world.level = data.level;

  world.players = data.players || [];
  world.enemies = data.enemies || [];
  world.snowballs = data.snowballs || [];
  world.walls = data.walls || [];
  world.houses = data.houses || [];
  world.shots = data.shots || [];
}

function localPlayer() {
  return world.players.find(p => p.id === localId);
}

/* -------------------- Eingaben -------------------- */

function getInput(player) {
  const dxKeys =
    (keys.d || keys.ArrowRight ? 1 : 0) -
    (keys.a || keys.ArrowLeft ? 1 : 0);

  const dyKeys =
    (keys.s || keys.ArrowDown ? 1 : 0) -
    (keys.w || keys.ArrowUp ? 1 : 0);

  let dx = dxKeys;
  let dy = dyKeys;

  if (Math.abs(touch.x) > 0.05 || Math.abs(touch.y) > 0.05) {
    dx = touch.x;
    dy = touch.y;
  }

  const length = Math.hypot(dx, dy);

  if (length > 1) {
    dx /= length;
    dy /= length;
  }

  let aimX = mouse.x + camera.x - player.x;
  let aimY = mouse.y + camera.y - player.y;
  const aimLength = Math.hypot(aimX, aimY);

  if (aimLength > 0.01) {
    aimX /= aimLength;
    aimY /= aimLength;
  } else {
    aimX = Math.cos(player.angle);
    aimY = Math.sin(player.angle);
  }

  return {
    dx,
    dy,
    aimX,
    aimY,
    shoot: mouse.down || touch.shooting || !!keys[" "],
    wall: !!keys.e,
    house: !!keys.h
  };
}

function sendClientInput(now) {
  if (!online || isHost || !hostConnection || !hostConnection.open) {
    return;
  }

  if (now - lastInputSend < 40) return;
  lastInputSend = now;

  const player = localPlayer();
  if (!player) return;

  hostConnection.send({
    type: "input",
    name: getName(),
    input: getInput(player)
  });
}

/* -------------------- Spielmechanik -------------------- */

function blocked(x, y, radius) {
  for (const wall of world.walls) {
    if (
      x + radius > wall.x &&
      x - radius < wall.x + wall.w &&
      y + radius > wall.y &&
      y - radius < wall.y + wall.h
    ) return true;
  }

  for (const house of world.houses) {
    if (
      x + radius > house.x &&
      x - radius < house.x + house.w &&
      y + radius > house.y &&
      y - radius < house.y + house.h
    ) return true;
  }

  return false;
}

function movePlayer(player, dx, dy) {
  const nx = clamp(
    player.x + dx,
    player.r,
    world.width - player.r
  );

  if (!blocked(nx, player.y, player.r)) {
    player.x = nx;
  }

  const ny = clamp(
    player.y + dy,
    player.r,
    world.height - player.r
  );

  if (!blocked(player.x, ny, player.r)) {
    player.y = ny;
  }
}

function buildStructure(player, type) {
  if (!player || !player.alive) return;

  const cost = type === "wall" ? 5 : 15;

  if (player.snow < cost) {
    if (player.id === localId) {
      notify("Du brauchst " + cost + " Schneebälle.");
    }
    return;
  }

  const distance = 60;
  const bx = player.x + Math.cos(player.angle) * distance;
  const by = player.y + Math.sin(player.angle) * distance;

  const structure = type === "wall"
    ? { x: bx - 24, y: by - 8, w: 48, h: 16 }
    : { x: bx - 28, y: by - 24, w: 56, h: 48 };

  if (
    structure.x < 0 ||
    structure.y < 0 ||
    structure.x + structure.w > world.width ||
    structure.y + structure.h > world.height ||
    blocked(bx, by, 25)
  ) return;

  if (type === "wall") {
    world.walls.push(structure);
  } else {
    world.houses.push(structure);
  }

  player.snow -= cost;
}

function buildFromClient(type) {
  if (!online || isHost) {
    const player = localPlayer();
    if (player) buildStructure(player, type);
    return;
  }

  if (hostConnection && hostConnection.open) {
    hostConnection.send({
      type: "build",
      building: type
    });
  }
}

function shoot(player, now) {
  if (now - player.lastShot < 380) return;

  player.lastShot = now;

  const vx = Math.cos(player.angle);
  const vy = Math.sin(player.angle);

  world.shots.push({
    x: player.x + vx * 24,
    y: player.y + vy * 24,
    vx: vx * 510,
    vy: vy * 510,
    owner: player.id,
    life: 1.5,
    r: 6
  });
}

function dropSnow(x, y, amount = 3) {
  world.snowballs.push({ x, y, amount, r: 8 });
}

function spawnEnemy() {
  const side = Math.floor(Math.random() * 4);
  let x;
  let y;

  if (side === 0) {
    x = random(0, world.width);
    y = 20;
  } else if (side === 1) {
    x = world.width - 20;
    y = random(0, world.height);
  } else if (side === 2) {
    x = random(0, world.width);
    y = world.height - 20;
  } else {
    x = 20;
    y = random(0, world.height);
  }

  const hp = 35 + world.level * 9;

  world.enemies.push({
    id: "enemy-" + enemyId++,
    x,
    y,
    r: 16 + Math.min(world.level, 6),
    hp,
    maxHp: hp,
    speed: 45 + world.level * 4
  });
}

function updateHost(dt, now) {
  if (!isHost || gameOver) return;

  for (const player of world.players) {
    if (!player.alive) continue;

    const input = player.isLocal
      ? getInput(player)
      : player.input;

    player.input = input;

    if (Math.hypot(input.aimX, input.aimY) > 0.05) {
      player.angle = Math.atan2(input.aimY, input.aimX);
    } else if (Math.hypot(input.dx, input.dy) > 0.05) {
      player.angle = Math.atan2(input.dy, input.dx);
    }

    movePlayer(
      player,
      input.dx * player.speed * dt,
      input.dy * player.speed * dt
    );

    if (input.shoot) shoot(player, now);

    if (input.wall && now - player.lastWall > 450) {
      player.lastWall = now;
      buildStructure(player, "wall");
    }

    if (input.house && now - player.lastHouse > 450) {
      player.lastHouse = now;
      buildStructure(player, "house");
    }

    for (const drop of world.snowballs) {
      if (
        drop.amount > 0 &&
        Math.hypot(player.x - drop.x, player.y - drop.y) <
          player.r + drop.r + 4
      ) {
        player.snow += drop.amount;
        drop.amount = 0;
      }
    }
  }

  world.snowballs = world.snowballs.filter(d => d.amount > 0);

  const spawnInterval = Math.max(400, 1800 - world.level * 90);

  if (now - lastSpawn > spawnInterval) {
    lastSpawn = now;

    const count = Math.min(1 + Math.floor(world.level / 3), 4);

    for (let i = 0; i < count; i++) {
      spawnEnemy();
    }
  }

  for (const enemy of world.enemies) {
    let target = null;
    let nearest = Infinity;

    for (const player of world.players) {
      if (!player.alive) continue;

      const distance = Math.hypot(
        player.x - enemy.x,
        player.y - enemy.y
      );

      if (distance < nearest) {
        nearest = distance;
        target = player;
      }
    }

    if (!target) continue;

    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const length = Math.hypot(dx, dy) || 1;

    const nx = enemy.x + dx / length * enemy.speed * dt;
    const ny = enemy.y + dy / length * enemy.speed * dt;

    if (!blocked(nx, ny, enemy.r)) {
      enemy.x = nx;
      enemy.y = ny;
    }

    if (
      Math.hypot(target.x - enemy.x, target.y - enemy.y) <
      enemy.r + target.r
    ) {
      target.hp -= 24 * dt;

      if (target.hp <= 0) {
        target.hp = 0;
        target.alive = false;
        dropSnow(target.x, target.y, 8);
      }
    }
  }

  for (const shot of world.shots) {
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    shot.life -= dt;

    for (const enemy of world.enemies) {
      if (enemy.hp <= 0) continue;

      if (
        Math.hypot(shot.x - enemy.x, shot.y - enemy.y) <
        shot.r + enemy.r
      ) {
        enemy.hp -= 25;
        shot.life = 0;

        if (enemy.hp <= 0) {
          dropSnow(
            enemy.x,
            enemy.y,
            3 + Math.floor(Math.random() * 4)
          );
        }

        break;
      }
    }
  }

  world.shots = world.shots.filter(shot =>
    shot.life > 0 &&
    shot.x >= 0 &&
    shot.y >= 0 &&
    shot.x <= world.width &&
    shot.y <= world.height
  );

  world.enemies = world.enemies.filter(enemy => enemy.hp > 0);

  if (world.enemies.length === 0 && now - lastSpawn > 1800) {
    world.level++;
    world.width += 350;
    world.height += 250;

    for (const player of world.players) {
      if (player.alive) player.snow += 5;
    }

    notify("Level " + world.level + " erreicht!");
  }

  if (
    world.players.length > 0 &&
    world.players.every(player => !player.alive)
  ) {
    gameOver = true;
    notify("Game Over!", 100000);
  }
}

/* -------------------- Kamera und Darstellung -------------------- */

function updateCamera() {
  const player = localPlayer();
  if (!player) return;

  camera.x = clamp(
    player.x - VIEW_W / 2,
    0,
    Math.max(0, world.width - VIEW_W)
  );

  camera.y = clamp(
    player.y - VIEW_H / 2,
    0,
    Math.max(0, world.height - VIEW_H)
  );
}

function drawGround() {
  ctx.fillStyle = "#d8edf0";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.strokeStyle = "#c5e0e5";
  ctx.lineWidth = 1;

  const grid = 80;

  for (let x = -(camera.x % grid); x < VIEW_W; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, VIEW_H);
    ctx.stroke();
  }

  for (let y = -(camera.y % grid); y < VIEW_H; y += grid) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(VIEW_W, y);
    ctx.stroke();
  }
}

function drawPlayer(player) {
  const x = player.x - camera.x;
  const y = player.y - camera.y;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(player.angle);

  // Pinguinkörper
  ctx.fillStyle = player.alive ? "#202b35" : "#737e83";
  ctx.beginPath();
  ctx.ellipse(0, 0, 18, 22, 0, 0, Math.PI * 2);
  ctx.fill();

  // Bauch
  ctx.fillStyle = "#f5f7f5";
  ctx.beginPath();
  ctx.ellipse(3, 5, 10, 13, 0, 0, Math.PI * 2);
  ctx.fill();

  // Schnabel zeigt in Blickrichtung
  ctx.fillStyle = "#f7a83e";
  ctx.beginPath();
  ctx.moveTo(12, -4);
  ctx.lineTo(26, 0);
  ctx.lineTo(12, 5);
  ctx.closePath();
  ctx.fill();

  // Auge
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(7, -8, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(8, -8, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  ctx.textAlign = "center";
  ctx.font = "12px Arial";
  ctx.fillStyle = "#10202a";
  ctx.fillText(player.name, x, y - 30);

  ctx.fillStyle = "#9b3434";
  ctx.fillRect(x - 19, y + 27, 38, 5);

  ctx.fillStyle = "#62d46b";
  ctx.fillRect(
    x - 19,
    y + 27,
    38 * clamp(player.hp / 100, 0, 1),
    5
  );

  if (!player.alive) {
    ctx.fillStyle = "#9b3434";
    ctx.fillText("KO", x, y + 45);
  }
}

function drawWorld() {
  drawGround();

  ctx.strokeStyle = "#6e9ca8";
  ctx.lineWidth = 5;
  ctx.strokeRect(
    -camera.x,
    -camera.y,
    world.width,
    world.height
  );

  for (const house of world.houses) {
    const x = house.x - camera.x;
    const y = house.y - camera.y;

    ctx.fillStyle = "#a9784e";
    ctx.fillRect(x, y, house.w, house.h);

    ctx.fillStyle = "#6d4831";
    ctx.beginPath();
    ctx.moveTo(x - 5, y + 4);
    ctx.lineTo(x + house.w / 2, y - 14);
    ctx.lineTo(x + house.w + 5, y + 4);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#bfe9f2";
    ctx.fillRect(
      x + house.w * 0.62,
      y + house.h * 0.35,
      10,
      12
    );
  }

  for (const wall of world.walls) {
    ctx.fillStyle = "#79a5b1";
    ctx.fillRect(
      wall.x - camera.x,
      wall.y - camera.y,
      wall.w,
      wall.h
    );

    ctx.strokeStyle = "#4c7885";
    ctx.strokeRect(
      wall.x - camera.x,
      wall.y - camera.y,
      wall.w,
      wall.h
    );
  }

  for (const drop of world.snowballs) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(
      drop.x - camera.x,
      drop.y - camera.y,
      drop.r,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.strokeStyle = "#86b6c6";
    ctx.stroke();
  }

  for (const shot of world.shots) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(
      shot.x - camera.x,
      shot.y - camera.y,
      shot.r,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  for (const enemy of world.enemies) {
    const x = enemy.x - camera.x;
    const y = enemy.y - camera.y;

    ctx.fillStyle = "#c74343";
    ctx.beginPath();
    ctx.arc(x, y, enemy.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x - 5, y - 4, 3, 0, Math.PI * 2);
    ctx.arc(x + 5, y - 4, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#542020";
    ctx.fillRect(x - 18, y - enemy.r - 10, 36, 4);

    ctx.fillStyle = "#ff7474";
    ctx.fillRect(
      x - 18,
      y - enemy.r - 10,
      36 * clamp(enemy.hp / enemy.maxHp, 0, 1),
      4
    );
  }

  for (const player of world.players) {
    drawPlayer(player);
  }

  if (gameOver) {
    ctx.fillStyle = "#08131bd9";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    ctx.textAlign = "center";
    ctx.fillStyle = "#ff7b72";
    ctx.font = "bold 48px Arial";
    ctx.fillText("GAME OVER", VIEW_W / 2, VIEW_H / 2);
  }
}

function drawMinimap() {
  const w = mini.width;
  const h = mini.height;

  mctx.fillStyle = "#d8edf0";
  mctx.fillRect(0, 0, w, h);

  const sx = w / world.width;
  const sy = h / world.height;

  mctx.fillStyle = "#a9784e";

  for (const house of world.houses) {
    mctx.fillRect(
      house.x * sx,
      house.y * sy,
      Math.max(2, house.w * sx),
      Math.max(2, house.h * sy)
    );
  }

  mctx.fillStyle = "#719daa";

  for (const wall of world.walls) {
    mctx.fillRect(
      wall.x * sx,
      wall.y * sy,
      Math.max(2, wall.w * sx),
      Math.max(2, wall.h * sy)
    );
  }

  mctx.fillStyle = "#c74343";

  for (const enemy of world.enemies) {
    mctx.beginPath();
    mctx.arc(enemy.x * sx, enemy.y * sy, 2.4, 0, Math.PI * 2);
    mctx.fill();
  }

  for (const player of world.players) {
    mctx.fillStyle = player.id === localId ? "#25821f" : "#1673bd";
    mctx.beginPath();
    mctx.arc(player.x * sx, player.y * sy, 3.5, 0, Math.PI * 2);
    mctx.fill();
  }

  mctx.strokeStyle = "#375b68";
  mctx.strokeRect(0, 0, w, h);
}

function updateUI(now) {
  const player = localPlayer();

  levelStat.textContent = world.level;
  snowStat.textContent = player ? player.snow : 0;
  playersStat.textContent = world.players.length + "/" + MAX_PLAYERS;
  enemiesStat.textContent = world.enemies.length;

  playerList.replaceChildren();

  for (const p of world.players) {
    const item = document.createElement("li");
    item.textContent =
      p.name +
      (p.id === localId ? " (Du)" : "") +
      (!p.alive ? " – KO" : "");

    playerList.appendChild(item);
  }

  if (noticeUntil && now > noticeUntil && !gameOver) {
    notice.textContent = "";
    noticeUntil = 0;
  }
}

/* -------------------- Hauptschleife -------------------- */

function gameLoop(now) {
  if (!running) return;

  const dt = Math.min(
    0.04,
    Math.max(0, (now - lastFrame) / 1000)
  );

  lastFrame = now;

  if (isHost) {
    updateHost(dt, now);

    if (online && now - lastSnapshot >= 60) {
      lastSnapshot = now;
      broadcastSnapshot();
    }
  } else {
    sendClientInput(now);
  }

  updateCamera();
  drawWorld();
  drawMinimap();
  updateUI(now);

  requestAnimationFrame(gameLoop);
}

/* -------------------- Tastatur und Maus -------------------- */

window.addEventListener("keydown", event => {
  const key = event.key.length === 1
    ? event.key.toLowerCase()
    : event.key;

  keys[key] = true;

  if (
    ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "]
      .includes(event.key)
  ) {
    event.preventDefault();
  }
});

window.addEventListener("keyup", event => {
  const key = event.key.length === 1
    ? event.key.toLowerCase()
    : event.key;

  keys[key] = false;
});

canvas.addEventListener("mousemove", event => {
  const rect = canvas.getBoundingClientRect();

  mouse.x = (event.clientX - rect.left) * VIEW_W / rect.width;
  mouse.y = (event.clientY - rect.top) * VIEW_H / rect.height;
});

canvas.addEventListener("mousedown", event => {
  if (event.button === 0) mouse.down = true;
});

window.addEventListener("mouseup", () => {
  mouse.down = false;
});

canvas.addEventListener("contextmenu", event => {
  event.preventDefault();
});

/* -------------------- Mobile-Steuerung -------------------- */

const joystick = document.getElementById("joystick");
const stick = document.getElementById("stick");

let joystickPointer = null;

function setStick(event) {
  const rect = joystick.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const max = rect.width * 0.34;

  let dx = event.clientX - cx;
  let dy = event.clientY - cy;
  const length = Math.hypot(dx, dy);

  if (length > max) {
    dx = dx / length * max;
    dy = dy / length * max;
  }

  touch.x = dx / max;
  touch.y = dy / max;

  stick.style.left = (rect.width / 2 - 24 + dx) + "px";
  stick.style.top = (rect.height / 2 - 24 + dy) + "px";
}

function releaseJoystick() {
  joystickPointer = null;
  touch.x = 0;
  touch.y = 0;
  stick.style.left = "calc(50% - 24px)";
  stick.style.top = "calc(50% - 24px)";
}

joystick.addEventListener("pointerdown", event => {
  joystickPointer = event.pointerId;
  joystick.setPointerCapture(event.pointerId);
  setStick(event);
});

joystick.addEventListener("pointermove", event => {
  if (event.pointerId === joystickPointer) {
    setStick(event);
  }
});

joystick.addEventListener("pointerup", releaseJoystick);
joystick.addEventListener("pointercancel", releaseJoystick);
joystick.addEventListener("lostpointercapture", releaseJoystick);

const shootBtn = document.getElementById("shootBtn");

shootBtn.addEventListener("pointerdown", event => {
  event.preventDefault();
  touch.shooting = true;
  shootBtn.setPointerCapture(event.pointerId);
});

shootBtn.addEventListener("pointerup", () => {
  touch.shooting = false;
});

shootBtn.addEventListener("pointercancel", () => {
  touch.shooting = false;
});

shootBtn.addEventListener("lostpointercapture", () => {
  touch.shooting = false;
});

/* -------------------- Buttons -------------------- */

document.getElementById("wallBtn").addEventListener("click", () => {
  buildFromClient("wall");
});

document.getElementById("houseBtn").addEventListener("click", () => {
  buildFromClient("house");
});

document.getElementById("mobileWallBtn").addEventListener("click", () => {
  buildFromClient("wall");
});

document.getElementById("mobileHouseBtn").addEventListener("click", () => {
  buildFromClient("house");
});

document.getElementById("soloBtn").addEventListener("click", () => {
  closeNetwork();
  resetWorld();

  isHost = true;
  online = false;
  localId = makeId("solo-");

  world.players.push(
    makePlayer(localId, getName(), 220, 220, true)
  );

  startGame();
});

document.getElementById("createBtn").addEventListener("click", createOnlineRoom);
document.getElementById("joinBtn").addEventListener("click", joinOnlineRoom);
document.getElementById("leaveBtn").addEventListener("click", returnToMenu);

roomInput.addEventListener("keydown", event => {
  if (event.key === "Enter") joinOnlineRoom();
});

window.addEventListener("beforeunload", () => {
  if (hostConnection && hostConnection.open) {
    try {
      hostConnection.send({ type: "leave" });
    } catch (_) {}
  }

  closeNetwork();
});
