/* Attacke Pinguin – upgrades */

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
  if (player.id === localId) playSound("upgrade");
  player.weaponLevel = (player.weaponLevel || 1) + 1;
  player.pendingUpgradeChoices = [];
  if ((player.queuedUpgrades || 0) > 0) {
    player.queuedUpgrades--;
    player.pendingUpgradeChoices = makeUpgradeChoices();
    if (player.id === localId) notify("Nächstes Upgrade: Wähle erneut!", 3200);
  }
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






function buyShopItem(item) {
  const player = localPlayer();
  if (!player || !player.alive) return;
  if (online && !isHost) { if (hostConnection && hostConnection.open) hostConnection.send({ type: "shop", item }); return; }
  applyShopItem(player, item);
}
function applyShopItem(player, item) {
  if (!player || !player.alive) return false;
  const costs = { heal: 12, power: 20, speed: 20 }, cost = costs[item];
  if (!cost || (player.coins || 0) < cost) { if (player.id === localId) notify("Nicht genug Münzen!", 1800); return false; }
  player.coins -= cost;
  if (item === "heal") player.hp = Math.min(player.maxHp || 100, player.hp + Math.ceil((player.maxHp || 100) * 0.45));
  if (item === "power") player.damageBonus = (player.damageBonus || 0) + 10;
  if (item === "speed") player.speed = Math.min(390, (player.speed || 220) + 12);
  if (player.id === localId) notify(item === "heal" ? "Heilung gekauft!" : item === "power" ? "Schaden verbessert!" : "Tempo verbessert!", 2000);
  return true;
}
function spinReward() {
  const player = localPlayer();
  if (!player || !player.pendingWheel) return;
  if (online && !isHost) { if (hostConnection && hostConnection.open) hostConnection.send({ type: "wheel" }); return; }
  applyWheelReward(player);
}
function applyWheelReward(player) {
  if (!player || !player.pendingWheel) return false;
  player.pendingWheel = false;
  const roll = Math.random(); let result = "";
  if (roll < 0.025) {
    player.machineGun = true; player.fireRateMultiplier = Math.max(0.22, (player.fireRateMultiplier || 1) * 0.45);
    player.extraProjectiles = Math.max(5, player.extraProjectiles || 0); player.damageBonus = (player.damageBonus || 0) + 35;
    result = "JACKPOT: MASCHINENGEWEHR! Dauerfeuer freigeschaltet.";
  } else if (roll < 0.22) { player.hp = player.maxHp || 100; player.coins = (player.coins || 0) + 35; result = "Großer Gewinn: volle Heilung + 35 Münzen.";
  } else if (roll < 0.42) { player.damageBonus = (player.damageBonus || 0) + 25; result = "Gewinn: +25 Schaden.";
  } else if (roll < 0.58) { player.speed = Math.min(390, (player.speed || 220) + 25); result = "Gewinn: +25 Tempo.";
  } else if (roll < 0.72) { player.maxHp = (player.maxHp || 100) + 35; player.hp = Math.min(player.maxHp, player.hp + 35); result = "Gewinn: +35 maximale HP.";
  } else if (roll < 0.82) { player.hp = Math.max(1, player.hp - Math.ceil((player.maxHp || 100) * 0.25)); result = "Pech: 25 % deiner HP verloren.";
  } else if (roll < 0.92) { player.speed = Math.max(150, (player.speed || 220) - 18); result = "Pech: -18 Tempo.";
  } else { player.damageBonus = Math.max(-10, (player.damageBonus || 0) - 12); result = "Pech: -12 Schaden."; }
  const node = document.getElementById("wheelResult");
  if (node && player.id === localId) node.textContent = result;
  if (player.id === localId) notify(result, 4000);
  return true;
}
for (const [id, item] of [["shopHealBtn","heal"],["shopPowerBtn","power"],["shopSpeedBtn","speed"]]) {
  const button = document.getElementById(id); if (button) button.addEventListener("click", () => buyShopItem(item));
}
const spinWheelButton = document.getElementById("spinWheelBtn");
if (spinWheelButton) spinWheelButton.addEventListener("click", spinReward);
