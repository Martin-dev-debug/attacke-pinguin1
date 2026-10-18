
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
const upgradeProgress = document.getElementById("upgradeProgress");
const upgradeProgressText = document.getElementById("upgradeProgressText");
const bossBar = document.getElementById("bossBar");
const bossBarFill = document.getElementById("bossBarFill");
const bossBarLabel = document.getElementById("bossBarLabel");
const gameOverStats = document.getElementById("gameOverStats");
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
const achievementSet = new Set();
try { for (const id of JSON.parse(localStorage.getItem("attackePinguinAchievements") || "[]")) achievementSet.add(id); } catch (_) {}
function unlockAchievement(id, title) {
  if (achievementSet.has(id)) return;
  achievementSet.add(id);
  try { const saved = JSON.parse(localStorage.getItem("attackePinguinAchievements") || "[]"); if (!saved.includes(id)) localStorage.setItem("attackePinguinAchievements", JSON.stringify([...saved, id])); } catch (_) {}
  notify("ERFOLG FREIGESCHALTET: " + title, 3500);
}

const keys = {};
const mouse = { x: VIEW_W / 2 + 100, y: VIEW_H / 2, down: false, active: false };
const touch = { x: 0, y: 0, shooting: false };

const world = {
  width: 1800,
  height: 1400,
  minX: 0, minY: 0, kills: 0, bossDefeated: 0, bossSpawnedAtLevel: 0,
  level: 1,
  players: [],
  enemies: [],
  snowballs: [],
  walls: [],
  houses: [],
  shots: []
};

const camera = { x: 0, y: 0 };









/* -------------------- PeerJS-Verbindung -------------------- */




/*
 * Der Host nimmt höchstens neun Mitspieler auf.
 * Zusammen mit dem Host sind das maximal zehn Spieler.
 */




/* -------------------- Synchronisierung -------------------- */






/* -------------------- Eingaben -------------------- */



/* -------------------- Spielmechanik -------------------- */


const UPGRADE_POOL = [
  { id: "power", title: "Stärkere Schneebälle", description: "+10 Schaden pro Treffer.", icon: "❄", apply: p => { p.damageBonus = (p.damageBonus || 0) + 10; } },
  { id: "rapid", title: "Schnellfeuer", description: "Wirf Schneebälle 15 % schneller.", icon: "⚡", apply: p => { p.fireRateMultiplier = Math.max(0.45, (p.fireRateMultiplier || 1) * 0.85); } },
  { id: "multi", title: "Mehrfachwurf", description: "Wirf pro Angriff einen zusätzlichen Schneeball.", icon: "✦", apply: p => { p.extraProjectiles = Math.min(4, (p.extraProjectiles || 0) + 1); } },
  { id: "speed", title: "Pinguin-Sprint", description: "+25 Bewegungsgeschwindigkeit.", icon: "➤", apply: p => { p.speed = Math.min(360, (p.speed || 220) + 25); } },
  { id: "vitality", title: "Eisiges Herz", description: "+25 maximale Lebenspunkte und heilt 25.", icon: "♥", apply: p => { p.maxHp = (p.maxHp || 100) + 25; p.hp = Math.min(p.maxHp, p.hp + 25); } },
  { id: "armor", title: "Schneepanzer", description: "Du erleidest 12 % weniger Kontaktschaden.", icon: "⬡", apply: p => { p.damageReduction = Math.min(0.6, (p.damageReduction || 0) + 0.12); } },
  { id: "magnet", title: "Schneemagnet", description: "Sammle Schneebälle aus größerer Entfernung ein.", icon: "◎", apply: p => { p.pickupRadius = Math.min(100, (p.pickupRadius || 0) + 22); } },
  { id: "piercing", title: "Durchschlagskraft", description: "Schneebälle durchdringen einen zusätzlichen Gegner.", icon: "➶", apply: p => { p.piercing = Math.min(5, (p.piercing || 0) + 1); } },
  { id: "blast", title: "Schneeball-Bombe", description: "Treffer verursachen kleinen Flächenschaden.", icon: "✹", apply: p => { p.blastRadius = Math.min(100, (p.blastRadius || 0) + 24); } }
];





/* -------------------- Kamera und Darstellung -------------------- */







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
  mouse.active = true;
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


window.addEventListener("blur", () => {
  for (const key of Object.keys(keys)) keys[key] = false;
  mouse.down = false;
  touch.x = 0; touch.y = 0; touch.shooting = false;
  if (typeof releaseJoystick === "function") releaseJoystick();
});
