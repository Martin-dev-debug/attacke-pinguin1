/* Attacke Pinguin – player */

function loadMetaProgress() {
  try { return JSON.parse(localStorage.getItem("attackePinguinMeta") || '{"coins":0,"ownedSkins":["classic"],"skin":"classic","passXP":0}'); }
  catch (_) { return { coins: 0, ownedSkins: ["classic"], skin: "classic", passXP: 0 }; }
}
function saveMetaProgress(player) {
  if (!player || player.id !== localId) return;
  const meta = loadMetaProgress();
  meta.coins = Math.max(0, Math.floor(player.coins || 0));
  meta.passXP = Math.max(meta.passXP || 0, player.kills || 0);
  try { localStorage.setItem("attackePinguinMeta", JSON.stringify(meta)); } catch (_) {}
}
function makePlayer(id, name, x, y, local = false) {
  const meta = loadMetaProgress();
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
    kills: 0,
    coins: local ? Math.max(0, Number(meta.coins) || 0) : 0,
    downedAt: 0,
    reviveProgress: 0,
    skin: local ? (meta.skin || "classic") : "classic",
    regenPerSecond: 0,
    critChance: 0,
    shotSize: 6,
    level: 1,
    weaponLevel: 1,
    nextUpgradeAt: 25,
    respawnAt: 0,
    pendingUpgradeChoices: [],
    queuedUpgrades: 0,
    damageBonus: 0,
    fireRateMultiplier: 1,
    extraProjectiles: 0,
    pickupRadius: 0,
    damageReduction: 0,
    piercing: 0,
    blastRadius: 0,
    maxHp: 100,
    killHeal: 0,
    dropBonus: 0,
    luckyDrops: 0,
    projectileSpeedBonus: 0,
    slowChance: 0,
    shieldCharges: 0,
    shieldUntil: 0,
    respawnHealBonus: false,
    pendingWheel: false,
    alive: true,
    isLocal: local,
    input: {
      dx: 0,
      dy: 0,
      aimX: 1,
      aimY: 0,
      shoot: false,
      wall: false,
      house: false,
      revive: false
    },
    lastShot: 0,
    lastWall: 0,
    lastHouse: 0
  };
}


function localPlayer() {
  return world.players.find(p => p.id === localId);
}


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
  if (mouse.down) {
    const targetX = camera.x + mouse.x, targetY = camera.y + mouse.y;
    const aimDx = targetX - player.x, aimDy = targetY - player.y;
    const aimLength = Math.hypot(aimDx, aimDy);
    if (aimLength > 1) { aimX = aimDx / aimLength; aimY = aimDy / aimLength; }
  } else if (touch.shooting) {
    let nearest = null, nearestDistance = 700;
    for (const enemy of world.enemies) {
      const distance = Math.hypot(enemy.x - player.x, enemy.y - player.y);
      if (distance < nearestDistance) { nearest = enemy; nearestDistance = distance; }
    }
    if (nearest) {
      const aimDx = nearest.x - player.x, aimDy = nearest.y - player.y;
      const aimLength = Math.hypot(aimDx, aimDy) || 1;
      aimX = aimDx / aimLength; aimY = aimDy / aimLength;
    } else if (Math.hypot(dx, dy) > 0.05) {
      const len = Math.hypot(dx, dy); aimX = dx / len; aimY = dy / len;
    }
  } else if (Math.hypot(dx, dy) > 0.05) {
    const len = Math.hypot(dx, dy); aimX = dx / len; aimY = dy / len;
  }

  return {
    dx,
    dy,
    aimX,
    aimY,
    shoot: mouse.down || touch.shooting || !!keys[" "],
    wall: !!keys.q,
    house: !!keys.h,
    revive: !!keys.r
  };
}


function movePlayer(player, dx, dy) {
  // Keine Kartenränder: Die Welt wird bei Bedarf um den Spieler erweitert.
  const nx = player.x + dx;
  if (!blocked(nx, player.y, player.r)) player.x = nx;

  const ny = player.y + dy;
  if (!blocked(player.x, ny, player.r)) player.y = ny;
}

