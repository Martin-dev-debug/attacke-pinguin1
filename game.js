
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
  paused = false;
  if (pauseOverlay) pauseOverlay.classList.add("hidden");
  closeNetwork();
  gamePanel.classList.add("hidden");
  menu.classList.remove("hidden");
}

function startGame() {
  if (running) return;

  running = true;
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
    const x=house.x-camera.x,y=house.y-camera.y;
    ctx.fillStyle="#e8f8fc";ctx.beginPath();
    ctx.ellipse(x+house.w/2,y+house.h*0.62,house.w/2,house.h*0.58,0,Math.PI,0);
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

    ctx.fillStyle = enemy.type === "boss" ? "#7e45b8" : enemy.type === "heavy" ? "#e27b32" : "#c74343";
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
  weaponStat.textContent = "Stufe " + (player ? (player.weaponLevel || 1) : 1);

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
if(pauseBtn)pauseBtn.addEventListener("click",()=>setPaused(!paused));
const resumeBtn=document.getElementById("resumeBtn");if(resumeBtn)resumeBtn.addEventListener("click",()=>setPaused(false));
const pauseLeaveBtn=document.getElementById("pauseLeaveBtn");if(pauseLeaveBtn)pauseLeaveBtn.addEventListener("click",returnToMenu);
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
