/* Attacke Pinguin – ui */

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

