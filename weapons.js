/* Attacke Pinguin – weapons */

function buildStructure(player, type) {
  if (!player || !player.alive) return;

  const cost = type === "wall" ? 5 : 15;

  if (player.snow < cost) {
    if (player.id === localId) {
      notify("Du brauchst " + cost + " Schneebälle.");
    }
    return;
  }

  const distance = 60;
  const bx = player.x + Math.cos(player.angle) * distance;
  const by = player.y + Math.sin(player.angle) * distance;

  const structure = type === "wall"
    ? { x: bx - 24, y: by - 8, w: 48, h: 16 }
    : { x: bx - 28, y: by - 24, w: 56, h: 48 };

  if (
    blocked(bx, by, 25)
  ) return;

  if (type === "wall") {
    world.walls.push(structure);
  } else {
    world.houses.push(structure);
  }

  player.snow -= cost;
}


function buildFromClient(type) {
  if (!online || isHost) {
    const player = localPlayer();
    if (player) buildStructure(player, type);
    return;
  }

  if (hostConnection && hostConnection.open) {
    hostConnection.send({
      type: "build",
      building: type
    });
  }
}


function shoot(player, now) {
  const level = player.weaponLevel || 1;
  const cooldown = player.machineGun ? 65 : Math.max(115, (380 - (level - 1) * 38) * (player.fireRateMultiplier || 1));
  if (now - player.lastShot < cooldown) return;
  player.lastShot = now;
  if (player.id === localId) playSound("throw");
  const base = player.angle || 0, count = Math.min(6, (level >= 5 ? 3 : level >= 3 ? 2 : 1) + (player.extraProjectiles || 0));
  for (let i = 0; i < count; i++) {
    const offset = count === 1 ? 0 : (i - (count - 1) / 2) * (count >= 4 ? 0.16 : count === 3 ? 0.22 : 0.12);
    const angle = base + offset, vx = Math.cos(angle), vy = Math.sin(angle);
    world.shots.push({x:player.x+vx*24,y:player.y+vy*24,vx:vx*(510+(level-1)*22)*(1+(player.projectileSpeedBonus||0)),vy:vy*(510+(level-1)*22)*(1+(player.projectileSpeedBonus||0)),owner:player.id,life:1.5,r:Math.max(6, player.shotSize || (level>=4?8:6)),damage:(25+(level-1)*8+(player.damageBonus||0))*(Math.random()<(player.critChance||0)?2:1),piercing:player.piercing||0,blastRadius:player.blastRadius||0,hitIds:[]});
  }
}


function dropSnow(x, y, amount = 3) {
  world.snowballs.push({ x, y, amount, r: 8 });
}

