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




