
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
const weaponStat = document.getElementById("weaponStat");
const pauseOverlay = document.getElementById("pauseOverlay");
const pauseBtn = document.getElementById("pauseBtn");
const restartBtn = document.getElementById("restartBtn");

let peer = null;
let hostConnection = null;
let connections = new Map();
let pendingConnections = new Set();

let isHost = false;
let online = false;
let running = false;
let paused = false;
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
let gameStartedAt = 0;
let nextTimedLevelAt = 0;

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
  gameStartedAt = 0;
  nextTimedLevelAt = 0;
  gameOver = false;
  paused = false;
  if (pauseOverlay) pauseOverlay.classList.add("hidden");
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
    totalSnowCollected: 0,
    weaponLevel: 1,
    nextUpgradeAt: 50,
    pendingUpgradeChoices: [],
    damageBonus: 0,
    fireRateMultiplier: 1,
    extraProjectiles: 0,
    pickupRadius: 0,
    damageReduction: 0,
    maxHp: 100,
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
  document.body.classList.remove("game-running");
  paused = false;
  if (pauseOverlay) pauseOverlay.classList.add("hidden");
  closeNetwork();
  gamePanel.classList.add("hidden");
  menu.classList.remove("hidden");
}

function startGame() {
  if (running) return;

  running = true;
  document.body.classList.add("game-running");
  paused = false;
  if (pauseOverlay) pauseOverlay.classList.add("hidden");
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

    if (data.type === "upgrade" && conn.playerId) {
      const player = world.players.find(p => p.id === conn.playerId);
      if (player) applyUpgradeChoice(player, String(data.upgradeId || ""));
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
        if (!paused) applySnapshot(data.world);
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
      totalSnowCollected: p.totalSnowCollected || 0,
      weaponLevel: p.weaponLevel || 1,
      nextUpgradeAt: p.nextUpgradeAt || 50,
      pendingUpgradeChoices: p.pendingUpgradeChoices || [],
      damageBonus: p.damageBonus || 0,
      fireRateMultiplier: p.fireRateMultiplier || 1,
      extraProjectiles: p.extraProjectiles || 0,
      pickupRadius: p.pickupRadius || 0,
      damageReduction: p.damageReduction || 0,
      maxHp: p.maxHp || 100,
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

  let aimX = player.angle ? Math.cos(player.angle) : 1;
  let aimY = player.angle ? Math.sin(player.angle) : 0;
  if (Math.hypot(dx, dy) > 0.05) {
    const len = Math.hypot(dx, dy); aimX = dx / len; aimY = dy / len;
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
  // Keine Kartenränder: Die Welt wird bei Bedarf um den Spieler erweitert.
  const nx = player.x + dx;
  if (!blocked(nx, player.y, player.r)) player.x = nx;

  const ny = player.y + dy;
  if (!blocked(player.x, ny, player.r)) player.y = ny;
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
  const level = player.weaponLevel || 1;
  const cooldown = Math.max(115, (380 - (level - 1) * 38) * (player.fireRateMultiplier || 1));
  if (now - player.lastShot < cooldown) return;
  player.lastShot = now;
  const base = player.angle || 0, count = Math.min(6, (level >= 5 ? 3 : level >= 3 ? 2 : 1) + (player.extraProjectiles || 0));
  for (let i = 0; i < count; i++) {
    const offset = count === 1 ? 0 : (i - (count - 1) / 2) * (count >= 4 ? 0.16 : count === 3 ? 0.22 : 0.12);
    const angle = base + offset, vx = Math.cos(angle), vy = Math.sin(angle);
    world.shots.push({x:player.x+vx*24,y:player.y+vy*24,vx:vx*(510+(level-1)*22),vy:vy*(510+(level-1)*22),owner:player.id,life:1.5,r:level>=4?8:6,damage:25+(level-1)*8+(player.damageBonus||0)});
  }
}

function dropSnow(x, y, amount = 3) {
  world.snowballs.push({ x, y, amount, r: 8 });
}

const UPGRADE_POOL = [
  { id: "power", title: "Stärkere Schneebälle", description: "+10 Schaden pro Treffer.", icon: "❄", apply: p => { p.damageBonus = (p.damageBonus || 0) + 10; } },
  { id: "rapid", title: "Schnellfeuer", description: "Wirf Schneebälle 15 % schneller.", icon: "⚡", apply: p => { p.fireRateMultiplier = Math.max(0.45, (p.fireRateMultiplier || 1) * 0.85); } },
  { id: "multi", title: "Mehrfachwurf", description: "Wirf pro Angriff einen zusätzlichen Schneeball.", icon: "✦", apply: p => { p.extraProjectiles = Math.min(4, (p.extraProjectiles || 0) + 1); } },
  { id: "speed", title: "Pinguin-Sprint", description: "+25 Bewegungsgeschwindigkeit.", icon: "➤", apply: p => { p.speed = Math.min(360, (p.speed || 220) + 25); } },
  { id: "vitality", title: "Eisiges Herz", description: "+25 maximale Lebenspunkte und heilt 25.", icon: "♥", apply: p => { p.maxHp = (p.maxHp || 100) + 25; p.hp = Math.min(p.maxHp, p.hp + 25); } },
  { id: "armor", title: "Schneepanzer", description: "Du erleidest 12 % weniger Kontaktschaden.", icon: "⬡", apply: p => { p.damageReduction = Math.min(0.6, (p.damageReduction || 0) + 0.12); } },
  { id: "magnet", title: "Schneemagnet", description: "Sammle Schneebälle aus größerer Entfernung ein.", icon: "◎", apply: p => { p.pickupRadius = Math.min(100, (p.pickupRadius || 0) + 22); } }
];

function makeUpgradeChoices() {
  const pool = [...UPGRADE_POOL];
  const choices = [];
  while (pool.length && choices.length < 3) {
    const index = Math.floor(Math.random() * pool.length);
    const upgrade = pool.splice(index, 1)[0];
    choices.push({ id: upgrade.id, title: upgrade.title, description: upgrade.description, icon: upgrade.icon });
  }
  return choices;
}

function chooseUpgrade(upgradeId) {
  const player = localPlayer();
  if (!player || !player.pendingUpgradeChoices || !player.pendingUpgradeChoices.some(choice => choice.id === upgradeId)) return;

  if (online && !isHost) {
    if (hostConnection && hostConnection.open) hostConnection.send({ type: "upgrade", upgradeId });
    return;
  }

  applyUpgradeChoice(player, upgradeId);
}

function applyUpgradeChoice(player, upgradeId) {
  if (!player || !Array.isArray(player.pendingUpgradeChoices)) return false;
  const offered = player.pendingUpgradeChoices.find(choice => choice.id === upgradeId);
  if (!offered) return false;
  const upgrade = UPGRADE_POOL.find(item => item.id === upgradeId);
  if (!upgrade) return false;
  upgrade.apply(player);
  player.weaponLevel = (player.weaponLevel || 1) + 1;
  player.pendingUpgradeChoices = [];
  if (player.id === localId) notify("Upgrade gewählt: " + upgrade.title, 2600);
  return true;
}

function renderUpgradeChoices(player) {
  const overlay = document.getElementById("upgradeOverlay");
  const choicesBox = document.getElementById("upgradeChoices");
  if (!overlay || !choicesBox) return;
  const choices = player && player.pendingUpgradeChoices;
  if (!choices || !choices.length || !running) {
    overlay.classList.add("hidden");
    choicesBox.replaceChildren();
    return;
  }
  overlay.classList.remove("hidden");
  const key = choices.map(choice => choice.id).join("|");
  if (choicesBox.dataset.choiceKey === key) return;
  choicesBox.dataset.choiceKey = key;
  choicesBox.replaceChildren();
  for (const choice of choices) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "upgrade-choice";
    button.innerHTML = '<span class="upgrade-icon"></span><strong></strong><span></span>';
    button.querySelector(".upgrade-icon").textContent = choice.icon || "✦";
    button.querySelector("strong").textContent = choice.title;
    button.querySelector("span:last-child").textContent = choice.description;
    button.addEventListener("click", () => chooseUpgrade(choice.id));
    button.addEventListener("pointerdown", event => event.stopPropagation());
    choicesBox.appendChild(button);
  }
}


function spawnEnemy() {
  const alive=world.players.filter(p=>p.alive);
  const target=alive.length?alive[Math.floor(Math.random()*alive.length)]:{x:world.width/2,y:world.height/2};
  const a=random(0,Math.PI*2),d=random(470,680);
  const x=target.x+Math.cos(a)*d, y=target.y+Math.sin(a)*d;
  // Neue Gegnertypen erscheinen mit steigendem Level; Werte skalieren unbegrenzt mit.
  let type="normal";
  const roll=Math.random();
  // Die seltenen, späten Gegnertypen haben Vorrang und überschreiben
  // sich nicht gegenseitig.
  if (world.level >= 15 && roll < 0.12) type = "phantom";
  else if (world.level >= 10 && roll < 0.24) type = "crystal";
  else if (world.level >= 12 && roll < 0.36) type = "boss";
  else if (world.level >= 9 && roll < 0.49) type = "elite";
  else if (world.level >= 6 && roll < 0.62) type = "armored";
  else if (world.level >= 4 && roll < 0.74) type = "ice";
  else if (world.level >= 3 && roll < 0.86) type = "heavy";
  const scale=1+(world.level-1)*0.16;
  const baseHp=({boss:210,elite:150,armored:115,ice:75,heavy:85,normal:35,crystal:125,phantom:105})[type];
  const baseDamage=({boss:62,elite:48,armored:42,ice:32,heavy:38,normal:24,crystal:45,phantom:39})[type];
  const baseSpeed=({boss:38,elite:58,armored:31,ice:55,heavy:34,normal:45,crystal:48,phantom:78})[type];
  const baseRadius=({boss:31,elite:25,armored:24,ice:19,heavy:23,normal:16,crystal:23,phantom:20})[type];
  const hp=Math.round(baseHp*scale);
  world.enemies.push({id:"enemy-"+enemyId++,type,x,y,r:baseRadius+Math.min(world.level,12),hp,maxHp:hp,damage:Math.round(baseDamage*(1+(world.level-1)*0.08)),speed:baseSpeed+Math.min(world.level*2.5,65)});
}

function ensureEndlessWorld() {
  // Wichtig: Niemals Spieler oder Weltobjekte verschieben. Das verursachte
  // Teleports, sobald jemand in die Nähe des alten Kartenrands kam.
  // Die Spielfläche hat keine Begrenzung; diese Werte dienen nur der Minimap
  // und werden rein anhand positiver Koordinaten vergrößert.
  for (const p of world.players) {
    if (p.x > world.width - 600) world.width = Math.ceil((p.x + 1200) / 600) * 600;
    if (p.y > world.height - 500) world.height = Math.ceil((p.y + 1000) / 500) * 500;
  }
}

function updateHost(dt, now) {
  if (!isHost || gameOver) return;
  ensureEndlessWorld();

  // Das Level steigt garantiert mit der Spielzeit, auch wenn noch Gegner leben.
  if (!gameStartedAt) {
    gameStartedAt = now;
    nextTimedLevelAt = now + 30000;
  }
  if (now >= nextTimedLevelAt) {
    world.level++;
    nextTimedLevelAt += 30000;
    for (const player of world.players) {
      if (player.alive) player.snow += 5;
    }
    notify("Level " + world.level + " – die Gegner werden stärker!", 3200);
  }

  for (const player of world.players) {
    if (!player.alive) continue;

    if (player.pendingUpgradeChoices && player.pendingUpgradeChoices.length) {
      player.input = { dx: 0, dy: 0, aimX: Math.cos(player.angle || 0), aimY: Math.sin(player.angle || 0), shoot: false, wall: false, house: false };
      continue;
    }

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
          player.r + drop.r + 4 + (player.pickupRadius || 0)
      ) {
        player.snow += drop.amount;
        player.totalSnowCollected = (player.totalSnowCollected || 0) + drop.amount;
        drop.amount = 0;
        if (!player.pendingUpgradeChoices || !player.pendingUpgradeChoices.length) {
          while (player.totalSnowCollected >= (player.nextUpgradeAt || 50)) {
            player.nextUpgradeAt = (player.nextUpgradeAt || 50) + 50;
            player.pendingUpgradeChoices = makeUpgradeChoices();
            if (player.id === localId) notify("Wähle dein Upgrade!", 3200);
            break;
          }
        }
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
      target.hp -= (enemy.damage || 24) * (1 - Math.min(0.7, target.damageReduction || 0)) * dt;

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

    let hitStructure = false;
    for (const wall of world.walls) {
      if (shot.x >= wall.x && shot.x <= wall.x + wall.w && shot.y >= wall.y && shot.y <= wall.y + wall.h) {
        wall.hp = (wall.hp ?? 3) - 1; shot.life = 0; hitStructure = true;
        if (wall.hp <= 0) world.walls = world.walls.filter(item => item !== wall);
        break;
      }
    }
    if (!hitStructure) for (const house of world.houses) {
      if (shot.x >= house.x && shot.x <= house.x + house.w && shot.y >= house.y && shot.y <= house.y + house.h) {
        house.hp = (house.hp ?? 8) - 1; shot.life = 0; hitStructure = true;
        if (house.hp <= 0) world.houses = world.houses.filter(item => item !== house);
        break;
      }
    }
    if (hitStructure) continue;
    for (const enemy of world.enemies) {
      if (enemy.hp <= 0) continue;

      if (
        Math.hypot(shot.x - enemy.x, shot.y - enemy.y) <
        shot.r + enemy.r
      ) {
        enemy.hp -= shot.damage || 25;
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
    shot.life > 0
  );

  world.enemies = world.enemies.filter(enemy => enemy.hp > 0);

  // Levelaufstieg läuft zeitbasiert oben in updateHost, nicht nur wenn
  // zufällig gerade keine Gegner auf der Karte sind.

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

  // Die Kamera kennt keine Kartenkanten und folgt dem Spieler überallhin.
  camera.x = player.x - VIEW_W / 2;
  camera.y = player.y - VIEW_H / 2;
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

  for (const house of world.houses) {
    const x=house.x-camera.x,y=house.y-camera.y;
    ctx.fillStyle="#e8f8fc";ctx.beginPath();ctx.ellipse(x+house.w/2,y+house.h*0.62,house.w/2,house.h*0.58,0,Math.PI,0);
    ctx.lineTo(x+house.w,y+house.h*0.82);ctx.quadraticCurveTo(x+house.w/2,y+house.h*1.15,x,y+house.h*0.82);ctx.closePath();ctx.fill();
    ctx.strokeStyle="#8bbac8";ctx.lineWidth=2;ctx.stroke();ctx.strokeStyle="#b0dce7";ctx.lineWidth=1;
    for(let row=0;row<3;row++){const yy=y+10+row*10;ctx.beginPath();ctx.moveTo(x+8,yy);ctx.lineTo(x+house.w-8,yy);ctx.stroke();}
    ctx.fillStyle="#83b8c9";ctx.beginPath();ctx.arc(x+house.w/2,y+house.h-2,9,Math.PI,0);ctx.fill();
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

    const enemyColors = {
      normal: "#c74343", heavy: "#e27b32", ice: "#39b9d5",
      armored: "#687783", elite: "#d83c91", boss: "#7e45b8",
      crystal: "#39d9a7", phantom: "#5144a8"
    };
    ctx.fillStyle = enemyColors[enemy.type] || enemyColors.normal;
    ctx.beginPath();
    if (enemy.type === "crystal") {
      // Kristallgegner: kantige, sechszackige Silhouette.
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3 - Math.PI / 2;
        const px = x + Math.cos(a) * (i % 2 === 0 ? enemy.r + 5 : enemy.r * 0.72);
        const py = y + Math.sin(a) * (i % 2 === 0 ? enemy.r + 5 : enemy.r * 0.72);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else if (enemy.type === "phantom") {
      // Phantomgegner: rautenförmiger Schatten mit Spitzen.
      ctx.moveTo(x, y - enemy.r - 7);
      ctx.lineTo(x + enemy.r * 0.72, y - enemy.r * 0.15);
      ctx.lineTo(x + enemy.r, y + enemy.r * 0.75);
      ctx.lineTo(x, y + enemy.r * 0.45);
      ctx.lineTo(x - enemy.r, y + enemy.r * 0.75);
      ctx.lineTo(x - enemy.r * 0.72, y - enemy.r * 0.15);
      ctx.closePath();
    } else if (enemy.type === "ice") {
      ctx.moveTo(x, y - enemy.r - 4);
      ctx.lineTo(x + enemy.r, y);
      ctx.lineTo(x, y + enemy.r + 4);
      ctx.lineTo(x - enemy.r, y);
      ctx.closePath();
    } else if (enemy.type === "elite" || enemy.type === "boss") {
      const spikes = enemy.type === "boss" ? 12 : 8;
      for (let i = 0; i < spikes * 2; i++) {
        const a = i * Math.PI / spikes;
        const radius = i % 2 === 0 ? enemy.r + 5 : enemy.r * 0.78;
        const px = x + Math.cos(a) * radius, py = y + Math.sin(a) * radius;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else {
      ctx.arc(x, y, enemy.r, 0, Math.PI * 2);
    }
    ctx.fill();
    if (enemy.type === "armored") {
      ctx.strokeStyle = "#d7e0e5";
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, enemy.r * 0.58, 0, Math.PI * 2); ctx.stroke();
    } else if (enemy.type === "ice") {
      ctx.strokeStyle = "#d8fbff"; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x-enemy.r*0.45,y); ctx.lineTo(x+enemy.r*0.45,y); ctx.stroke();
    } else if (enemy.type === "elite" || enemy.type === "boss") {
      ctx.strokeStyle = enemy.type === "boss" ? "#e6c8ff" : "#ffc6e4";
      ctx.lineWidth = 3; ctx.stroke();
    } else if (enemy.type === "crystal" || enemy.type === "phantom") {
      ctx.strokeStyle = enemy.type === "crystal" ? "#d1fff1" : "#c9c1ff";
      ctx.lineWidth = 3; ctx.stroke();
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(x, y, enemy.r * 0.55, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

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
  weaponStat.textContent = "Stufe " + (player ? (player.weaponLevel || 1) : 1);
  renderUpgradeChoices(player);

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

  if (paused) { updateCamera(); drawWorld(); drawMinimap(); updateUI(now); requestAnimationFrame(gameLoop); return; }

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

function setPaused(value) {
  paused=!!value&&running;
  if(pauseOverlay)pauseOverlay.classList.toggle("hidden",!paused);
  if(pauseBtn)pauseBtn.textContent=paused?"Fortsetzen":"Pause";
  if(paused){touch.x=0;touch.y=0;touch.shooting=false;mouse.down=false;for(const k of Object.keys(keys))keys[k]=false;}
}
function bindTap(button, action) {
  if (!button) return;
  let lastPointerAction = 0;
  button.style.touchAction = "manipulation";
  button.addEventListener("pointerdown", event => {
    // Mobile Safari/Chrome can fail to deliver a useful click after overlays change.
    lastPointerAction = performance.now();
    event.preventDefault();
    event.stopPropagation();
    action();
  });
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    // Keyboard and assistive-technology fallback; ignore click following pointerdown.
    if (performance.now() - lastPointerAction > 700) action();
  });
}
bindTap(pauseBtn, () => setPaused(!paused));
if (restartBtn) restartBtn.addEventListener("click", () => {
  if (!running) return;
  const oldPlayers = world.players.map(p => ({id:p.id,name:p.name,x:p.x,y:p.y,local:p.id===localId}));
  const wasOnline = online, wasHost = isHost;
  if (wasOnline && !wasHost) { notify("Nur der Gruppen-Ersteller kann die Runde neu starten."); return; }
  resetWorld();
  if (oldPlayers.length) {
    for (const p of oldPlayers) world.players.push(makePlayer(p.id,p.name,Math.max(100,p.x),Math.max(100,p.y),p.local));
  } else {
    localId = makeId("solo-"); world.players.push(makePlayer(localId,getName(),220,220,true));
  }
  isHost = wasHost; online = wasOnline; gameOver = false; paused = false;
  if (pauseOverlay) pauseOverlay.classList.add("hidden");
  notify("Neue Runde gestartet!");
});
const resumeBtn=document.getElementById("resumeBtn");bindTap(resumeBtn,()=>setPaused(false));
const pauseLeaveBtn=document.getElementById("pauseLeaveBtn");bindTap(pauseLeaveBtn,returnToMenu);
window.addEventListener("keydown",event=>{if(event.key==="Escape"&&running){event.preventDefault();setPaused(!paused);}});
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
