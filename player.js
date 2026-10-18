/* Attacke Pinguin – player */

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
    queuedUpgrades: 0,
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
  if (mouse.active && !touch.shooting) {
    const targetX = camera.x + mouse.x;
    const targetY = camera.y + mouse.y;
    const aimDx = targetX - player.x;
    const aimDy = targetY - player.y;
    const aimLength = Math.hypot(aimDx, aimDy);
    if (aimLength > 1) { aimX = aimDx / aimLength; aimY = aimDy / aimLength; }
  } else if (Math.hypot(dx, dy) > 0.05) {
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


function movePlayer(player, dx, dy) {
  // Keine Kartenränder: Die Welt wird bei Bedarf um den Spieler erweitert.
  const nx = player.x + dx;
  if (!blocked(nx, player.y, player.r)) player.x = nx;

  const ny = player.y + dy;
  if (!blocked(player.x, ny, player.r)) player.y = ny;
}

