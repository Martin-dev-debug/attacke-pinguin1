const $ = (id) => document.getElementById(id);
const canvas = $("gameCanvas");
const ctx = canvas.getContext("2d");

let peer = null;
let connection = null;
let isHost = false;
let connected = false;
let gameStarted = false;
let paused = false;
let gameOver = false;
let localId = "p1";
let roomCode = "";
let localName = "Pinguin 1";
let remoteName = "Pinguin 2";
let state = null;
let lastSnapshot = 0;
let lastSentInput = 0;
let previousKeys = {};
let mouse = { x: 550, y: 350, down: false };
let keys = {};
let lastFrame = performance.now();
let messageTimer = null;

const COLORS = {
  ground: "#c5e5eb",
  groundAlt: "#b9dce4",
  grid: "#a5ced8",
  wall: "#eaf8fc",
  house: "#f0f6f5",
  enemy: "#e56d67",
  fast: "#e8a64c",
  tank: "#a77bd7",
  shooter: "#6d99e9"
};

function newWorld() {
  return {
    started: false,
    level: 1,
    kills: 0,
    needed: 12,
    worldSize: 1800,
    time: 0,
    players: {},
    enemies: [],
    bullets: [],
    enemyBullets: [],
    drops: [],
    buildings: [],
    nextEnemy: 0,
    enemyId: 0,
    bulletId: 0,
    dropId: 0,
    buildingId: 0,
    paused: false,
    over: false
  };
}

function makePlayer(id, name, x, y) {
  return {
    id, name, x, y,
    hp: 100,
    snow: 30,
    kills: 0,
    speed: 230,
    angle: 0,
    shootCooldown: 0,
    buildCooldown: 0,
    invincible: 0,
    alive: true,
    input: { up: false, down: false, left: false, right: false,
      shoot: false, angle: 0, wall: false, house: false }
  };
}

function setMenuStatus(text) {
  $("menuStatus").textContent = text;
}

function showGame() {
  $("menu").classList.add("hidden");
  $("gameScreen").classList.remove("hidden");
}

function showMenu() {
  $("menu").classList.remove("hidden");
  $("gameScreen").classList.add("hidden");
  $("overlay").classList.add("hidden");
  $("roomBox").classList.add("hidden");
  $("hostBtn").disabled = false;
  $("joinBtn").disabled = false;
  $("joinCode").disabled = false;
  $("playerName").disabled = false;
  $("startBtn").disabled = true;
  $("hostStatus").textContent = "Warte auf deinen Mitspieler …";
  $("menuStatus").textContent = "";
  $("roomCode").textContent = "----";
  $("connectionText").textContent = "Nicht verbunden";
  $("hostBtn").textContent = "Gruppe erstellen";
}

function showMessage(text) {
  const box = $("gameMessage");
  box.textContent = text;
  box.classList.remove("hidden");
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => box.classList.add("hidden"), 2500);
}

function getName() {
  return $("playerName").value.trim().slice(0, 16) || "Pinguin";
}

function cleanupNetwork() {
  connected = false;
  gameStarted = false;
  connection = null;
  if (peer) {
    try { peer.destroy(); } catch (_) {}
  }
  peer = null;
}

function resetSession() {
  cleanupNetwork();
  state = null;
  paused = false;
  gameOver = false;
  previousKeys = {};
  keys = {};
  mouse.down = false;
  showMenu();
}

$("hostBtn").addEventListener("click", () => {
  if (typeof Peer === "undefined") {
    setMenuStatus("Die Netzwerkbibliothek konnte nicht geladen werden. Prüfe deine Internetverbindung.");
    return;
  }

  cleanupNetwork();
  isHost = true;
  localId = "p1";
  localName = getName();
  roomCode = Math.random().toString(36).slice(2, 8).toUpperCase();

  $("hostBtn").disabled = true;
  $("joinBtn").disabled = true;
  $("joinCode").disabled = true;
  $("playerName").disabled = true;
  $("roomBox").classList.remove("hidden");
  $("roomCode").textContent = roomCode;
  $("hostStatus").textContent = "Erstelle die Verbindung …";
  setMenuStatus("");

  peer = new Peer("attacke-pinguin-" + roomCode.toLowerCase());

  peer.on("open", () => {
    $("hostStatus").textContent = "Raum bereit. Warte auf deinen Freund …";
  });

  peer.on("connection", (conn) => {
    if (connection && connection.open) {
      conn.close();
      return;
    }
    connection = conn;
    conn.on("open", () => {
      connected = true;
      $("hostStatus").textContent = "Mitspieler verbunden: " + remoteName;
      $("startBtn").disabled = false;
      $("startBtn").textContent = "Gemeinsam starten";
      conn.send({ type: "welcome", name: localName, room: roomCode });
    });
    conn.on("data", handleHostMessage);
    conn.on("close", () => handleDisconnect());
    conn.on("error", () => handleDisconnect());
  });

  peer.on("error", (err) => {
    const reason = err.type === "unavailable-id"
      ? "Raum-ID bereits vergeben. Erstelle eine neue Gruppe."
      : "Verbindung fehlgeschlagen (" + err.type + "). Prüfe Internet und versuche es erneut.";
    setMenuStatus(reason);
    $("hostBtn").disabled = false;
    $("joinBtn").disabled = false;
    $("joinCode").disabled = false;
    $("playerName").disabled = false;
  });
});

$("copyRoomBtn").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(roomCode);
    $("copyRoomBtn").textContent = "Kopiert!";
    setTimeout(() => $("copyRoomBtn").textContent = "Kopieren", 1500);
  } catch (_) {
    setMenuStatus("Raum-ID bitte manuell kopieren: " + roomCode);
  }
});

$("startBtn").addEventListener("click", () => {
  if (!isHost || !connected || !connection) return;

  state = newWorld();
  state.players.p1 = makePlayer("p1", localName, 0, 0);
  state.players.p2 = makePlayer("p2", remoteName, 100, 0);
  state.started = true;
  gameStarted = true;
  paused = false;
  gameOver = false;
  spawnWave();
  connection.send({ type: "start", name: localName });
  showGame();
  showMessage("Überlebt gemeinsam. Baut eure Verteidigung!");
});

$("joinBtn").addEventListener("click", () => {
  if (typeof Peer === "undefined") {
    setMenuStatus("Die Netzwerkbibliothek konnte nicht geladen werden. Prüfe deine Internetverbindung.");
    return;
  }

  const code = $("joinCode").value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length < 4) {
    setMenuStatus("Gib die Raum-ID deines Freundes ein.");
    return;
  }

  cleanupNetwork();
  isHost = false;
  localId = "p2";
  localName = getName();
  roomCode = code;
  $("hostBtn").disabled = true;
  $("joinBtn").disabled = true;
  $("joinCode").disabled = true;
  $("playerName").disabled = true;
  setMenuStatus("Verbinde mit Raum " + code + " …");

  peer = new Peer();

  peer.on("open", () => {
    connection = peer.connect("attacke-pinguin-" + code.toLowerCase(), {
      reliable: true
    });

    connection.on("open", () => {
      connected = true;
      connection.send({ type: "hello", name: localName });
      setMenuStatus("Verbunden. Warte, bis der Host das Spiel startet …");
    });

    connection.on("data", (data) => {
      if (!data || typeof data !== "object") return;

      if (data.type === "welcome") {
        remoteName = data.name || "Host";
        setMenuStatus("Mit " + remoteName + " verbunden. Warte auf Spielstart …");
      } else if (data.type === "start") {
        gameStarted = true;
        showGame();
      } else if (data.type === "snapshot") {
        state = data.state;
        gameStarted = true;
        showGame();
        if (state.over && !gameOver) {
          gameOver = true;
          showOverlay("💥", "Team besiegt", "Eure Gruppe wurde überwältigt.", "Zum Menü");
        }
        if (state.paused && !$("overlay").classList.contains("hidden")) return;
        if (!state.paused && paused) {
          paused = false;
          $("overlay").classList.add("hidden");
        }
        updateHUD();
      } else if (data.type === "notice") {
        showMessage(data.text);
      } else if (data.type === "closed") {
        handleDisconnect();
      }
    });

    connection.on("close", handleDisconnect);
    connection.on("error", handleDisconnect);
  });

  peer.on("error", (err) => {
    setMenuStatus("Verbindung fehlgeschlagen (" + err.type + "). Prüfe die Raum-ID und versuche es erneut.");
    $("hostBtn").disabled = false;
    $("joinBtn").disabled = false;
    $("joinCode").disabled = false;
    $("playerName").disabled = false;
  });
});

function handleHostMessage(data) {
  if (!data || typeof data !== "object") return;

  if (data.type === "hello") {
    remoteName = String(data.name || "Pinguin 2").slice(0, 16);
    if (state && state.players.p2) state.players.p2.name = remoteName;
    $("hostStatus").textContent = "Mitspieler verbunden: " + remoteName;
  } else if (data.type === "input" && state && state.players.p2) {
    const p = state.players.p2;
    const input = data.input || {};
    p.input.up = !!input.up;
    p.input.down = !!input.down;
    p.input.left = !!input.left;
    p.input.right = !!input.right;
    p.input.shoot = !!input.shoot;
    p.input.angle = Number(input.angle) || 0;
    p.input.wall = !!input.wall;
    p.input.house = !!input.house;
  } else if (data.type === "pause" && state) {
    state.paused = !!data.paused;
    paused = state.paused;
    if (paused) showOverlay("❄️", "Pause", "Das Spiel wurde pausiert.", "Weiter spielen");
    else $("overlay").classList.add("hidden");
  }
}

function handleDisconnect() {
  connected = false;
  if (isHost) {
    $("hostStatus").textContent = "Mitspieler getrennt. Warte auf erneute Verbindung.";
    $("startBtn").disabled = true;
  } else if (gameStarted) {
    showOverlay("📡", "Verbindung verloren", "Der Host ist nicht mehr erreichbar.", "Zum Menü");
  } else {
    setMenuStatus("Verbindung unterbrochen. Prüfe die Raum-ID und versuche es erneut.");
  }
  $("connectionText").textContent = "Verbindung getrennt";
}

function getCamera() {
  if (!state || !state.players[localId]) return { x: 0, y: 0 };
  const p = state.players[localId];
  return {
    x: p.x - canvas.width / 2,
    y: p.y - canvas.height / 2
  };
}

function getLocalInput() {
  const camera = getCamera();
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const mx = (mouse.x - rect.left) * scaleX + camera.x;
  const my = (mouse.y - rect.top) * scaleY + camera.y;
  const p = state && state.players[localId];

  return {
    up: !!(keys.w || keys.ArrowUp),
    down: !!(keys.s || keys.ArrowDown),
    left: !!(keys.a || keys.ArrowLeft),
    right: !!(keys.d || keys.ArrowRight),
    shoot: !!mouse.down,
    angle: p ? Math.atan2(my - p.y, mx - p.x) : 0,
    wall: !!keys.e,
    house: !!keys.h
  };
}

window.addEventListener("keydown", (e) => {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
  if (!keys[key]) {
    if (key === "e") keys.e = true;
    if (key === "h") keys.h = true;
    if (key === "p" || key === "Escape") togglePause();
  }
  keys[key] = true;
});

window.addEventListener("keyup", (e) => {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  keys[key] = false;
});

canvas.addEventListener("mousemove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
canvas.addEventListener("mousedown", (e) => { if (e.button === 0) mouse.down = true; });
window.addEventListener("mouseup", (e) => { if (e.button === 0) mouse.down = false; });
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

function togglePause() {
  if (!gameStarted || gameOver) return;
  if (!isHost) {
    paused = !paused;
    connection?.send({ type: "pause", paused });
    if (paused) showOverlay("❄️", "Pause", "Pause angefordert.", "Weiter spielen");
    else $("overlay").classList.add("hidden");
    return;
  }
  paused = !paused;
  if (state) state.paused = paused;
  if (connection) connection.send({ type: "pause", paused });
  if (paused) showOverlay("❄️", "Pause", "Das Spiel ist pausiert.", "Weiter spielen");
  else $("overlay").classList.add("hidden");
}

$("pauseBtn").addEventListener("click", togglePause);
$("resumeBtn").addEventListener("click", () => {
  if (!gameStarted) return;
  if (!isHost) connection?.send({ type: "pause", paused: false });
  else {
    paused = false;
    if (state) state.paused = false;
    connection?.send({ type: "pause", paused: false });
  }
  paused = false;
  $("overlay").classList.add("hidden");
});

$("menuBtn").addEventListener("click", resetSession);
$("leaveBtn").addEventListener("click", resetSession);

function showOverlay(icon, title, text, buttonText) {
  $("overlayIcon").textContent = icon;
  $("overlayTitle").textContent = title;
  $("overlayText").textContent = text;
  $("resumeBtn").textContent = buttonText;
  $("overlay").classList.remove("hidden");
  if (title === "Team besiegt" || title === "Verbindung verloren") {
    $("resumeBtn").onclick = resetSession;
  } else {
    $("resumeBtn").onclick = () => {
      if (title === "Pause") {
        if (!isHost) connection?.send({ type: "pause", paused: false });
        else {
          paused = false;
          if (state) state.paused = false;
          connection?.send({ type: "pause", paused: false });
        }
        paused = false;
        $("overlay").classList.add("hidden");
      } else resetSession();
    };
  }
}

function spawnWave() {
  if (!state) return;
  const count = Math.min(7 + state.level * 3, 70);
  const size = state.worldSize;
  for (let i = 0; i < count; i++) {
    const edge = Math.floor(Math.random() * 4);
    let x = 0, y = 0;
    if (edge === 0) { x = Math.random() * size; y = -60; }
    if (edge === 1) { x = size + 60; y = Math.random() * size; }
    if (edge === 2) { x = Math.random() * size; y = size + 60; }
    if (edge === 3) { x = -60; y = Math.random() * size; }

    let type = "normal";
    const r = Math.random();
    if (state.level >= 2 && r > 0.78) type = "fast";
    if (state.level >= 3 && r > 0.88) type = "shooter";
    if (state.level >= 4 && r > 0.91) type = "tank";

    const settings = {
      normal: { hp: 2, speed: 65, damage: 12, size: 18, color: COLORS.enemy },
      fast: { hp: 1, speed: 125, damage: 8, size: 14, color: COLORS.fast },
      tank: { hp: 7, speed: 37, damage: 20, size: 27, color: COLORS.tank },
      shooter: { hp: 3, speed: 48, damage: 10, size: 18, color: COLORS.shooter }
    }[type];

    state.enemies.push({
      id: ++state.enemyId, x, y, type, ...settings,
      maxHp: settings.hp, shootCooldown: 1 + Math.random() * 2
    });
  }
  state.nextEnemy = 0;
}

function spawnDrop(x, y, amount) {
  state.drops.push({ id: ++state.dropId, x, y, amount, bob: Math.random() * 6 });
}

function shootSnowball(p) {
  if (p.shootCooldown > 0 || !p.alive) return;
  p.shootCooldown = Math.max(0.17, 0.42 - state.level * 0.008);
  state.bullets.push({
    id: ++state.bulletId,
    x: p.x + Math.cos(p.angle) * 18,
    y: p.y + Math.sin(p.angle) * 18,
    vx: Math.cos(p.angle) * 560,
    vy: Math.sin(p.angle) * 560,
    owner: p.id,
    life: 1.5,
    damage: 1
  });
}

function buildFor(p, type) {
  if (p.buildCooldown > 0 || !p.alive) return;
  const cost = type === "house" ? 35 : 10;
  if (p.snow < cost) {
    if (p.id === localId) showMessage("Nicht genug Schneebälle!");
    return;
  }

  const size = type === "house" ? 52 : 44;
  const x = Math.round((p.x + Math.cos(p.angle) * 60) / 44) * 44;
  const y = Math.round((p.y + Math.sin(p.angle) * 60) / 44) * 44;

  if (x < 0 || y < 0 || x > state.worldSize || y > state.worldSize) return;
  if (state.buildings.some(b => Math.hypot(b.x - x, b.y - y) < (b.size + size) * 0.6)) {
    if (p.id === localId) showMessage("Hier ist schon ein Gebäude!");
    return;
  }
  p.snow -= cost;
  p.buildCooldown = 0.3;
  state.buildings.push({
    id: ++state.buildingId, x, y, size,
    type, hp: type === "house" ? 18 : 9
  });
  if (p.id === localId) showMessage(type === "house" ? "Schneehaus gebaut!" : "Schneewand gebaut!");
}

function updateWorld(dt) {
  if (!state || !state.started || state.paused || state.over) return;
  state.time += dt;
  const players = Object.values(state.players);
  const livePlayers = players.filter(p => p.alive);

  if (livePlayers.length === 0) {
    state.over = true;
    gameOver = true;
    if (connection) connection.send({ type: "notice", text: "Euer Team wurde besiegt." });
    return;
  }

  for (const p of players) {
    if (!p.alive) continue;
    const i = p.input;
    let dx = (i.right ? 1 : 0) - (i.left ? 1 : 0);
    let dy = (i.down ? 1 : 0) - (i.up ? 1 : 0);
    const len = Math.hypot(dx, dy);
    if (len > 0) { dx /= len; dy /= len; }

    p.x += dx * p.speed * dt;
    p.y += dy * p.speed * dt;
    p.x = Math.max(20, Math.min(state.worldSize - 20, p.x));
    p.y = Math.max(20, Math.min(state.worldSize - 20, p.y));
    p.angle = i.angle;
    p.shootCooldown = Math.max(0, p.shootCooldown - dt);
    p.buildCooldown = Math.max(0, p.buildCooldown - dt);
    p.invincible = Math.max(0, p.invincible - dt);

    if (i.shoot) shootSnowball(p);
    if (i.wall) { buildFor(p, "wall"); p.input.wall = false; }
    if (i.house) { buildFor(p, "house"); p.input.house = false; }
  }

  // Gegner suchen den nächsten lebenden Spieler.
  for (const e of state.enemies) {
    const target = livePlayers.reduce((best, p) =>
      !best || Math.hypot(p.x - e.x, p.y - e.y) < Math.hypot(best.x - e.x, best.y - e.y)
        ? p : best, null);
    if (!target) continue;

    const dx = target.x - e.x, dy = target.y - e.y;
    const dist = Math.max(1, Math.hypot(dx, dy));

    if (e.type === "shooter") {
      if (dist > 240) {
        e.x += dx / dist * e.speed * dt;
        e.y += dy / dist * e.speed * dt;
      }
      e.shootCooldown -= dt;
      if (e.shootCooldown <= 0 && dist < 550) {
        e.shootCooldown = Math.max(0.65, 1.7 - state.level * 0.05);
        state.enemyBullets.push({
          x: e.x, y: e.y,
          vx: dx / dist * (250 + state.level * 5),
          vy: dy / dist * (250 + state.level * 5),
          life: 3, damage: e.damage
        });
      }
    } else {
      e.x += dx / dist * e.speed * (1 + state.level * 0.04) * dt;
      e.y += dy / dist * e.speed * (1 + state.level * 0.04) * dt;
    }

    // Gebäude blockieren Gegner.
    for (const b of state.buildings) {
      if (Math.hypot(e.x - b.x, e.y - b.y) < b.size * 0.65 + e.size * 0.4) {
        e.x -= dx / dist * e.speed * dt * 1.8;
        e.y -= dy / dist * e.speed * dt * 1.8;
        b.hp -= dt * 0.25;
      }
    }

    if (dist < e.size + 18 && target.invincible <= 0) {
      target.hp -= e.damage * dt;
      if (target.hp <= 0) {
        target.hp = 0;
        target.alive = false;
        if (target.id === localId) showMessage("Du wurdest eingefroren!");
      }
    }
  }

  state.buildings = state.buildings.filter(b => b.hp > 0);

  for (const b of state.bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    for (const e of state.enemies) {
      if (e.hp <= 0) continue;
      if (Math.hypot(e.x - b.x, e.y - b.y) < e.size + 5) {
        e.hp -= b.damage;
        b.life = 0;
        if (e.hp <= 0) {
          const owner = state.players[b.owner];
          if (owner) owner.kills++;
          state.kills++;
          spawnDrop(e.x, e.y, 3 + Math.floor(Math.random() * 4));
        }
        break;
      }
    }
    if (state.buildings.some(w => Math.hypot(w.x - b.x, w.y - b.y) < w.size * 0.6)) b.life = 0;
  }
  state.bullets = state.bullets.filter(b => b.life > 0);

  for (const b of state.enemyBullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    for (const p of livePlayers) {
      if (Math.hypot(p.x - b.x, p.y - b.y) < 18) {
        if (p.invincible <= 0) {
          p.hp -= b.damage;
          p.invincible = 0.25;
          if (p.hp <= 0) { p.hp = 0; p.alive = false; }
        }
        b.life = 0;
      }
    }
    if (state.buildings.some(w => Math.hypot(w.x - b.x, w.y - b.y) < w.size * 0.6)) b.life = 0;
  }
  state.enemyBullets = state.enemyBullets.filter(b => b.life > 0);

  for (const d of state.drops) {
    d.bob += dt * 4;
    for (const p of livePlayers) {
      if (Math.hypot(p.x - d.x, p.y - d.y) < 28) {
        p.snow += d.amount;
        d.amount = 0;
        if (p.id === localId) showMessage("+" + d.amount + " Schneebälle");
      }
    }
  }
  state.drops = state.drops.filter(d => d.amount > 0);

  state.enemies = state.enemies.filter(e => e.hp > 0);
  state.nextEnemy -= dt;
  if (state.nextEnemy <= 0) {
    const spawnCount = Math.min(1 + Math.floor(state.level / 3), 5);
    for (let i = 0; i < spawnCount; i++) spawnWaveEnemy();
    state.nextEnemy = Math.max(0.4, 2.4 - state.level * 0.09);
  }

  if (state.kills >= state.needed) {
    state.level++;
    state.needed += 12 + state.level * 4;
    state.worldSize += 420;
    for (const p of players) {
      p.hp = Math.min(100, p.hp + 25);
      p.snow += 12;
    }
    spawnWave();
    if (connection) connection.send({ type: "notice", text: "LEVEL " + state.level + "! Die Karte ist größer und die Gegner sind stärker!" });
  }
}

function spawnWaveEnemy() {
  const p = state.players.p1;
  if (!p) return;
  const edge = Math.floor(Math.random() * 4);
  let x = 0, y = 0;
  if (edge === 0) { x = Math.random() * state.worldSize; y = 0; }
  if (edge === 1) { x = state.worldSize; y = Math.random() * state.worldSize; }
  if (edge === 2) { x = Math.random() * state.worldSize; y = state.worldSize; }
  if (edge === 3) { x = 0; y = Math.random() * state.worldSize; }

  const r = Math.random();
  let type = "normal";
  if (state.level >= 2 && r > 0.72) type = "fast";
  if (state.level >= 3 && r > 0.83) type = "shooter";
  if (state.level >= 4 && r > 0.9) type = "tank";

  const stats = {
    normal: [2, 65, 12, 18, COLORS.enemy],
    fast: [1, 125, 8, 14, COLORS.fast],
    shooter: [3, 48, 10, 18, COLORS.shooter],
    tank: [7, 37, 20, 27, COLORS.tank]
  }[type];

  state.enemies.push({
    id: ++state.enemyId, x, y, type,
    hp: stats[0], maxHp: stats[0],
    speed: stats[1], damage: stats[2],
    size: stats[3], color: stats[4],
    shootCooldown: 1.2 + Math.random() * 2
  });
}

function sendLocalInput() {
  if (!gameStarted || !state || gameOver || paused) return;
  const input = getLocalInput();

  if (isHost) {
    const p = state.players.p1;
    if (!p) return;
    p.input.up = input.up;
    p.input.down = input.down;
    p.input.left = input.left;
    p.input.right = input.right;
    p.input.shoot = input.shoot;
    p.input.angle = input.angle;

    // Baubefehle werden nur einmal pro Tastendruck ausgelöst.
    p.input.wall = !!keys.e && !previousKeys.e;
    p.input.house = !!keys.h && !previousKeys.h;
    previousKeys.e = !!keys.e;
    previousKeys.h = !!keys.h;
  } else if (connection && connection.open) {
    connection.send({ type: "input", input });
  }
}

function updateHUD() {
  if (!state) return;
  const p = state.players[localId];
  $("level").textContent = state.level;
  $("mapSize").textContent = Math.round(state.worldSize / 1800) + "×";
  $("enemyCount").textContent = state.enemies.length;
  $("snow").textContent = p ? p.snow : 0;
  $("progressText").textContent = state.kills + " / " + state.needed;
  $("progressBar").style.width = Math.min(100, state.kills / state.needed * 100) + "%";
  $("difficultyText").textContent = "Schwierigkeit: " + ["Leicht", "Normal", "Hart", "Sehr hart", "Extrem"][Math.min(4, Math.floor((state.level - 1) / 2))];

  $("playersList").innerHTML = Object.values(state.players).map(pl => `
    <div class="player-line">
      <div class="player-avatar">${pl.id === "p1" ? "🐧" : "🐧"}</div>
      <div class="player-info">
        <strong>${escapeHTML(pl.name)}${pl.id === localId ? " (Du)" : ""}</strong>
        <small>${pl.alive ? "♥ " + Math.ceil(pl.hp) + "% Leben · " + pl.kills + " Kills" : "Eingefroren"}</small>
      </div>
    </div>
  `).join("");

  $("connectionText").textContent = connected ? "Gruppe verbunden" : "Nur lokal";
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function drawWorld() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = COLORS.ground;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!state) {
    ctx.fillStyle = "#214755";
    ctx.font = "bold 24px system-ui";
    ctx.fillText("Erstelle eine Gruppe oder tritt bei.", 35, 55);
    return;
  }

  const cam = getCamera();
  const sx = (x) => x - cam.x;
  const sy = (y) => y - cam.y;

  // Raster macht die Erkundung der Welt sichtbar.
  const grid = 44;
  const startX = Math.floor(cam.x / grid) * grid;
  const startY = Math.floor(cam.y / grid) * grid;
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  for (let x = startX; x < cam.x + canvas.width + grid; x += grid) {
    for (let y = startY; y < cam.y + canvas.height + grid; y += grid) {
      if (x < 0 || y < 0 || x > state.worldSize || y > state.worldSize) continue;
      ctx.strokeRect(sx(x), sy(y), grid, grid);
    }
  }

  // Grenzen der derzeit erkundbaren Karte.
  ctx.strokeStyle = "#557e8c";
  ctx.lineWidth = 6;
  ctx.strokeRect(sx(0), sy(0), state.worldSize, state.worldSize);

  // Schneeball-Drops.
  for (const d of state.drops) {
    const x = sx(d.x), y = sy(d.y + Math.sin(d.bob) * 4);
    ctx.fillStyle = "#f8ffff";
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#68b7d0"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#234d5d"; ctx.font = "bold 10px system-ui";
    ctx.fillText("+" + d.amount, x + 10, y - 8);
  }

  // Gebäude.
  for (const b of state.buildings) {
    const x = sx(b.x), y = sy(b.y), s = b.size;
    if (b.type === "wall") {
      ctx.fillStyle = "#eaf7fa";
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
      ctx.strokeStyle = "#8db8c7"; ctx.lineWidth = 3;
      ctx.strokeRect(x - s / 2, y - s / 2, s, s);
      ctx.strokeStyle = "#c1e0e7"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - s / 2, y); ctx.lineTo(x + s / 2, y); ctx.stroke();
    } else {
      ctx.fillStyle = "#e6f1ee";
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
      ctx.strokeStyle = "#8db8c7"; ctx.lineWidth = 3;
      ctx.strokeRect(x - s / 2, y - s / 2, s, s);
      ctx.fillStyle = "#6b9fb1";
      ctx.beginPath(); ctx.moveTo(x - s / 2 - 5, y - s / 2); ctx.lineTo(x, y - s / 2 - 24); ctx.lineTo(x + s / 2 + 5, y - s / 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#7ba8b5"; ctx.fillRect(x - 7, y + 2, 14, 24);
    }
    ctx.fillStyle = "#3a5966";
    ctx.fillRect(x - s / 2, y + s / 2 + 5, s, 3);
    ctx.fillStyle = "#7be2a0";
    ctx.fillRect(x - s / 2, y + s / 2 + 5, s * Math.max(0, b.hp / (b.type === "house" ? 18 : 9)), 3);
  }

  // Gegner.
  for (const e of state.enemies) {
    const x = sx(e.x), y = sy(e.y);
    ctx.fillStyle = e.color;
    ctx.beginPath(); ctx.arc(x, y, e.size, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(x - 5, y - 3, 3, 0, Math.PI * 2); ctx.arc(x + 5, y - 3, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#263a45";
    ctx.beginPath(); ctx.arc(x - 5, y - 3, 1.5, 0, Math.PI * 2); ctx.arc(x + 5, y - 3, 1.5, 0, Math.PI * 2); ctx.fill();
    if (e.hp < e.maxHp) {
      ctx.fillStyle = "#4b3434"; ctx.fillRect(x - e.size, y - e.size - 9, e.size * 2, 4);
      ctx.fillStyle = "#7be2a0"; ctx.fillRect(x - e.size, y - e.size - 9, e.size * 2 * e.hp / e.maxHp, 4);
    }
  }

  // Feindliche Projektile.
  ctx.fillStyle = "#f2a95c";
  for (const b of state.enemyBullets) {
    ctx.beginPath(); ctx.arc(sx(b.x), sy(b.y), 6, 0, Math.PI * 2); ctx.fill();
  }

  // Eigene Schneebälle.
  ctx.fillStyle = "#ffffff";
  for (const b of state.bullets) {
    ctx.beginPath(); ctx.arc(sx(b.x), sy(b.y), 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#a5d9e6"; ctx.lineWidth = 1; ctx.stroke();
  }

  // Pinguine.
  for (const p of Object.values(state.players)) {
    const x = sx(p.x), y = sy(p.y);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(p.angle);
    ctx.fillStyle = "#19313e";
    ctx.beginPath(); ctx.ellipse(0, 0, 15, 19, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#f2f8f7";
    ctx.beginPath(); ctx.ellipse(2, 3, 9, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#f4b64f";
    ctx.beginPath(); ctx.moveTo(12, -3); ctx.lineTo(23, 0); ctx.lineTo(12, 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(5, -7, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#172a35";
    ctx.beginPath(); ctx.arc(6, -7, 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Spielername und Lebensbalken.
    ctx.textAlign = "center";
    ctx.font = "bold 11px system-ui";
    ctx.fillStyle = "#183540";
    ctx.fillText(p.name + (p.id === localId ? " (Du)" : ""), x, y - 32);
    ctx.fillStyle = "#5a4545"; ctx.fillRect(x - 20, y - 27, 40, 4);
    ctx.fillStyle = p.hp > 35 ? "#48b887" : "#e76e6e";
    ctx.fillRect(x - 20, y - 27, 40 * p.hp / 100, 4);
    if (!p.alive) {
      ctx.fillStyle = "#7b2020";
      ctx.font = "bold 12px system-ui";
      ctx.fillText("EINGEFROREN", x, y - 40);
    }
  }

  // Anzeige der Kartengrenzen und Erkundungsgröße.
  ctx.textAlign = "left";
  ctx.fillStyle = "#234c5b";
  ctx.font = "bold 11px system-ui";
  ctx.fillText("ERKUNDE DIE SCHNEEWELT", 14, 22);
  ctx.font = "10px system-ui";
  ctx.fillText("Karte: " + state.worldSize + " × " + state.worldSize, 14, 38);
}

function frame(now) {
  const dt = Math.min(0.04, (now - lastFrame) / 1000 || 0);
  lastFrame = now;

  if (gameStarted && state && !gameOver) {
    if (isHost) {
      sendLocalInput();
      if (!paused) updateWorld(dt);

      if (connection && connection.open && now - lastSnapshot > 65) {
        connection.send({ type: "snapshot", state });
        lastSnapshot = now;
      }
    } else if (now - lastSentInput > 45) {
      sendLocalInput();
      lastSentInput = now;
    }
  }

  drawWorld();
  if (state) updateHUD();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);