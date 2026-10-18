
"use strict";

/* ATTACKE PINGUIN — Online-Spiel für bis zu 10 Spieler */

const MAX_PLAYERS = 10;
const VIEW_W = 960;
const VIEW_H = 600;

const canvas = document.getElementById("game");
const inputCanvas = document.getElementById("game3d") || canvas;
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
  { id: "power", title: "Eisgeschoss", description: "+10 Schneeball-Schaden.", icon: "❄", apply: p => { p.damageBonus = (p.damageBonus || 0) + 10; } },
  { id: "rapid", title: "Schnellfeuer", description: "15 % schneller werfen.", icon: "⚡", apply: p => { p.fireRateMultiplier = Math.max(0.35, (p.fireRateMultiplier || 1) * 0.85); } },
  { id: "multi", title: "Dreifachwurf", description: "+1 Schneeball pro Angriff.", icon: "✦", apply: p => { p.extraProjectiles = Math.min(5, (p.extraProjectiles || 0) + 1); } },
  { id: "speed", title: "Pinguin-Sprint", description: "+22 Bewegungsgeschwindigkeit.", icon: "➤", apply: p => { p.speed = Math.min(390, (p.speed || 220) + 22); } },
  { id: "vitality", title: "Eisiges Herz", description: "+30 maximale HP und heilt 30.", icon: "♥", apply: p => { p.maxHp = (p.maxHp || 100) + 30; p.hp = Math.min(p.maxHp, p.hp + 30); } },
  { id: "armor", title: "Schneepanzer", description: "12 % weniger Kontaktschaden.", icon: "⬡", apply: p => { p.damageReduction = Math.min(0.65, (p.damageReduction || 0) + 0.12); } },
  { id: "magnet", title: "Schneemagnet", description: "Sammle Schneebälle weiter entfernt ein.", icon: "◎", apply: p => { p.pickupRadius = Math.min(150, (p.pickupRadius || 0) + 24); } },
  { id: "piercing", title: "Durchschlagskraft", description: "Schneebälle durchdringen +1 Gegner.", icon: "➶", apply: p => { p.piercing = Math.min(7, (p.piercing || 0) + 1); } },
  { id: "blast", title: "Schneeball-Bombe", description: "+24 Explosionsradius bei Treffern.", icon: "✹", apply: p => { p.blastRadius = Math.min(130, (p.blastRadius || 0) + 24); } },
  { id: "regen", title: "Schneeregen", description: "Regeneriert 2 HP pro Sekunde.", icon: "✚", apply: p => { p.regenPerSecond = (p.regenPerSecond || 0) + 2; } },
  { id: "bigregen", title: "Tiefenheilung", description: "Heilt sofort 45 HP.", icon: "❣", apply: p => { p.hp = Math.min(p.maxHp || 100, p.hp + 45); } },
  { id: "lifesteal", title: "Eisklauenkraft", description: "Heilt 2 HP bei jedem besiegten Gegner.", icon: "🧊", apply: p => { p.killHeal = (p.killHeal || 0) + 2; } },
  { id: "crit", title: "Eis-Krit", description: "12 % Chance auf doppelten Schaden.", icon: "✳", apply: p => { p.critChance = Math.min(0.6, (p.critChance || 0) + 0.12); } },
  { id: "heavyshot", title: "Riesenschneeball", description: "Größere Schneebälle mit +15 Schaden.", icon: "●", apply: p => { p.damageBonus = (p.damageBonus || 0) + 15; p.shotSize = (p.shotSize || 6) + 2; } },
  { id: "dash", title: "Turbo-Flossen", description: "+10 % Bewegungstempo.", icon: "»", apply: p => { p.speed = Math.min(390, (p.speed || 220) * 1.10); } },
  { id: "maxhp", title: "Dicke Eisschicht", description: "+50 maximale HP.", icon: "▣", apply: p => { p.maxHp = (p.maxHp || 100) + 50; p.hp = Math.min(p.maxHp, p.hp + 20); } },
  { id: "doubleheal", title: "Erste-Hilfe-Iglu", description: "Heilt sofort 25 % deiner maximalen HP.", icon: "⛑", apply: p => { p.hp = Math.min(p.maxHp || 100, p.hp + Math.ceil((p.maxHp || 100) * 0.25)); } },
  { id: "frost", title: "Frostspur", description: "Gegner werden durch Treffer kurz gebremst.", icon: "❅", apply: p => { p.slowChance = Math.min(0.75, (p.slowChance || 0) + 0.15); } },
  { id: "doublecoins", title: "Schneeball-Bonus", description: "Mehr Schneebälle von besiegten Gegnern.", icon: "✧", apply: p => { p.dropBonus = (p.dropBonus || 0) + 2; } },
  { id: "longshot", title: "Fernwurf", description: "Schneebälle fliegen 20 % schneller.", icon: "➤", apply: p => { p.projectileSpeedBonus = (p.projectileSpeedBonus || 0) + 0.2; } },
  { id: "shield", title: "Eisschild", description: "Erhält einen kurzen Schutzschild.", icon: "◈", apply: p => { p.shieldCharges = (p.shieldCharges || 0) + 1; } },
  { id: "secondwind", title: "Zweiter Atem", description: "Bei Wiederbelebung mit voller HP starten.", icon: "↻", apply: p => { p.respawnHealBonus = true; } },
  { id: "fortune", title: "Glückspinguin", description: "10 % Chance auf doppelte Schneeball-Drops.", icon: "★", apply: p => { p.luckyDrops = Math.min(0.6, (p.luckyDrops || 0) + 0.1); } }
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

  if (paused) { updateCamera(); drawWorld(); drawMinimap(); updateUI(now); if (typeof render3DWorld === "function") render3DWorld(); requestAnimationFrame(gameLoop); return; }

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
  if (typeof render3DWorld === "function") render3DWorld();

  requestAnimationFrame(gameLoop);
}

/* -------------------- Tastatur und Maus -------------------- */

window.addEventListener("keydown", event => {
  const key = event.key.length === 1
    ? event.key.toLowerCase()
    : event.key;

  keys[key] = true;

  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) event.preventDefault();
  if (event.key.toLowerCase() === "e" && running && !gameOver && !event.repeat) {
    event.preventDefault();
    setPaused(!paused);
  }
});

window.addEventListener("keyup", event => {
  const key = event.key.length === 1
    ? event.key.toLowerCase()
    : event.key;

  keys[key] = false;
});

inputCanvas.addEventListener("mousemove", event => {
  const rect = inputCanvas.getBoundingClientRect();

  mouse.x = (event.clientX - rect.left) * VIEW_W / rect.width;
  mouse.y = (event.clientY - rect.top) * VIEW_H / rect.height;
  mouse.active = true;
});

inputCanvas.addEventListener("mousedown", event => {
  if (event.button === 0) mouse.down = true;
});

window.addEventListener("mouseup", () => {
  mouse.down = false;
});

inputCanvas.addEventListener("contextmenu", event => {
  event.preventDefault();
});

/* -------------------- Mobile-Steuerung -------------------- */

const joystick = document.getElementById("joystick");
const stick = document.getElementById("stick");

let joystickPointer = null;
let joystickOrigin = null;
let floatingJoystick = false;

function setStick(event) {
  const rect = joystick.getBoundingClientRect();
  const cx = floatingJoystick && joystickOrigin ? joystickOrigin.x : rect.left + rect.width / 2;
  const cy = floatingJoystick && joystickOrigin ? joystickOrigin.y : rect.top + rect.height / 2;
  const max = (floatingJoystick ? 56 : rect.width * 0.34);

  let dx = event.clientX - cx;
  let dy = event.clientY - cy;
  const length = Math.hypot(dx, dy);
  if (length > max) { dx = dx / length * max; dy = dy / length * max; }

  touch.x = dx / max;
  touch.y = dy / max;

  if (floatingJoystick) {
    joystick.style.position = "fixed";
    joystick.style.left = cx + "px";
    joystick.style.top = cy + "px";
    joystick.style.transform = "translate(-50%, -50%)";
    joystick.style.zIndex = "20003";
    stick.style.left = "calc(50% - 24px + " + dx + "px)";
    stick.style.top = "calc(50% - 24px + " + dy + "px)";
  } else {
    stick.style.left = (rect.width / 2 - 24 + dx) + "px";
    stick.style.top = (rect.height / 2 - 24 + dy) + "px";
  }
}

function releaseJoystick() {
  joystickPointer = null;
  joystickOrigin = null;
  floatingJoystick = false;
  touch.x = 0;
  touch.y = 0;
  joystick.style.position = "";
  joystick.style.left = "";
  joystick.style.top = "";
  joystick.style.transform = "";
  joystick.style.zIndex = "";
  stick.style.left = "calc(50% - 24px)";
  stick.style.top = "calc(50% - 24px)";
}

joystick.addEventListener("pointerdown", event => {
  event.preventDefault();
  joystickPointer = event.pointerId;
  joystickOrigin = null;
  floatingJoystick = false;
  joystick.setPointerCapture(event.pointerId);
  setStick(event);
});

joystick.addEventListener("pointermove", event => {
  if (event.pointerId === joystickPointer) setStick(event);
});
joystick.addEventListener("pointerup", releaseJoystick);
joystick.addEventListener("pointercancel", releaseJoystick);
joystick.addEventListener("lostpointercapture", releaseJoystick);

// Survival.io-ähnliche Steuerung: Auf der linken Spielfeldhälfte ziehen,
// der virtuelle Stick erscheint dort, wo der Finger aufgesetzt wurde.
inputCanvas.addEventListener("pointerdown", event => {
  if (event.pointerType === "mouse" || event.clientX > window.innerWidth * 0.55) return;
  if (!running || paused || gameOver) return;
  const upgradeOverlay = document.getElementById("upgradeOverlay");
  if (upgradeOverlay && !upgradeOverlay.classList.contains("hidden")) return;
  event.preventDefault();
  if (joystickPointer !== null) return;
  joystickPointer = event.pointerId;
  joystickOrigin = { x: event.clientX, y: event.clientY };
  floatingJoystick = true;
  joystick.setPointerCapture(event.pointerId);
  setStick(event);
});
joystick.addEventListener("pointermove", event => {
  if (event.pointerId === joystickPointer) setStick(event);
});

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
  const runOverOverlay = document.getElementById("runOverOverlay");
  if (runOverOverlay) runOverOverlay.classList.add("hidden");
  notify("Neue Runde gestartet!");
});
const resumeBtn=document.getElementById("resumeBtn");bindTap(resumeBtn,()=>setPaused(false));
const pauseLeaveBtn=document.getElementById("pauseLeaveBtn");bindTap(pauseLeaveBtn,returnToMenu);
window.addEventListener("keydown",event=>{if(event.key==="Escape"&&running&&!gameOver){event.preventDefault();setPaused(!paused);}});
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
