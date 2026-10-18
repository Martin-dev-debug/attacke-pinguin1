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

  levelStat.textContent = player ? (player.level || 1) : 1;
  snowStat.textContent = player ? player.snow : 0;
  playersStat.textContent = world.players.length + "/" + MAX_PLAYERS;
  enemiesStat.textContent = world.enemies.length;
  weaponStat.textContent = "Stufe " + (player ? (player.weaponLevel || 1) : 1);
  const killStat = document.getElementById("killStat"), coinStat = document.getElementById("coinStat");
  if (killStat) killStat.textContent = player ? (player.kills || 0) : 0;
  if (coinStat) coinStat.textContent = player ? (player.coins || 0) : 0;
  const pathText = document.getElementById("rewardPathText"), pathFill = document.getElementById("rewardTrackFill");
  const kills = player ? (player.kills || 0) : 0, pathStep = 10, pathProgress = kills % pathStep;
  if (pathText) pathText.textContent = kills >= 10 ? ((10 - pathProgress) || 10) + " Kills bis zur nächsten Pfad-Belohnung · Meilensteine geben Münzen" : (10 - kills) + " Kills bis zur ersten Pfad-Belohnung";
  if (pathFill) pathFill.style.width = (pathProgress / pathStep * 100) + "%";
  const wheelOverlay = document.getElementById("wheelOverlay");
  if (wheelOverlay) wheelOverlay.classList.toggle("hidden", !(player && player.pendingWheel));
  const collected = player ? (player.totalSnowCollected || 0) : 0, nextAt = player ? (player.nextUpgradeAt || 25) : 25;
  const level = player ? (player.level || 1) : 1;
  const needed = 25 + Math.max(0, level - 1) * 15;
  const progress = Math.max(0, Math.min(100, (collected - (nextAt - needed)) / needed * 100));
  if (upgradeProgress) upgradeProgress.style.width = progress + "%";
  if (upgradeProgressText) upgradeProgressText.textContent = Math.max(0, nextAt - collected) + " Schneebälle bis Level " + (level + 1);
  const boss = world.enemies.find(enemy => enemy.type === "boss");
  if (bossBar) bossBar.classList.toggle("hidden", !boss);
  if (bossBarFill) bossBarFill.style.width = boss ? Math.max(0, Math.min(100, boss.hp / boss.maxHp * 100)) + "%" : "0%";
  if (bossBarLabel) bossBarLabel.textContent = boss ? "EISRIESE · " + Math.ceil(boss.hp) + " / " + boss.maxHp : "";
  if (gameOverStats && gameOver) gameOverStats.textContent = "Level " + world.level + " · " + (world.kills || 0) + " Gegner besiegt · " + (world.bossDefeated || 0) + " Bosse besiegt · " + Math.floor((performance.now() - gameStartedAt) / 1000) + " Sekunden überlebt";
  renderUpgradeChoices(player);

  playerList.replaceChildren();

  for (const p of world.players) {
    const item = document.createElement("li");
    const respawnSeconds = p.respawnAt ? Math.max(0, Math.ceil((p.respawnAt - now) / 1000)) : 0;
    item.textContent =
      p.name +
      (p.id === localId ? " (Du)" : "") +
      (!p.alive ? " – Wieder da in " + respawnSeconds + " s" : " · Level " + (p.level || 1));

    playerList.appendChild(item);
  }

  if (noticeUntil && now > noticeUntil && !gameOver) {
    notice.textContent = "";
    noticeUntil = 0;
  }
}

