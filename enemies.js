/* Attacke Pinguin – enemies */

function spawnEnemy() {
  const alive=world.players.filter(p=>p.alive);
  const target=alive.length?alive[Math.floor(Math.random()*alive.length)]:{x:(world.minX||0)+world.width/2,y:(world.minY||0)+world.height/2};
  const a=random(0,Math.PI*2),d=random(470,680);
  const x=target.x+Math.cos(a)*d, y=target.y+Math.sin(a)*d;
  // Neue Gegnertypen erscheinen mit steigendem Level; Werte skalieren unbegrenzt mit.
  let type="normal";
  const roll=Math.random();
  // Die seltenen, späten Gegnertypen haben Vorrang und überschreiben
  // sich nicht gegenseitig.
  if (world.level >= 15 && roll < 0.12) type = "phantom";
  else if (world.level >= 10 && roll < 0.24) type = "crystal";
  else if (world.level >= 12 && roll < 0.36) type = "boss";
  else if (world.level >= 9 && roll < 0.49) type = "elite";
  else if (world.level >= 6 && roll < 0.62) type = "armored";
  else if (world.level >= 4 && roll < 0.74) type = "ice";
  else if (world.level >= 3 && roll < 0.86) type = "heavy";
  const scale=1+(world.level-1)*0.16;
  const baseHp=({boss:210,elite:150,armored:115,ice:75,heavy:85,normal:35,crystal:125,phantom:105})[type];
  const baseDamage=({boss:62,elite:48,armored:42,ice:32,heavy:38,normal:24,crystal:45,phantom:39})[type];
  const baseSpeed=({boss:38,elite:58,armored:31,ice:55,heavy:34,normal:45,crystal:48,phantom:78})[type];
  const baseRadius=({boss:31,elite:25,armored:24,ice:19,heavy:23,normal:16,crystal:23,phantom:20})[type];
  const hp=Math.round(baseHp*scale);
  world.enemies.push({id:"enemy-"+enemyId++,type,x,y,r:baseRadius+Math.min(world.level,12),hp,maxHp:hp,damage:Math.round(baseDamage*(1+(world.level-1)*0.08)),speed:baseSpeed+Math.min(world.level*2.5,65),abilityTimer:3+Math.random()*3,warning:0});
  if (world.enemies.length > 180) {
    const farthest = world.enemies.reduce((best, enemy) => { const d = Math.min(...alive.map(player => Math.hypot(player.x - enemy.x, player.y - enemy.y)), Infinity); return !best || d > best.distance ? {enemy,distance:d} : best; }, null);
    if (farthest) world.enemies = world.enemies.filter(enemy => enemy !== farthest.enemy);
  }
}


function updateHost(dt, now) {
  if (!isHost || gameOver) return;
  ensureEndlessWorld();

  // Das Level steigt garantiert mit der Spielzeit, auch wenn noch Gegner leben.
  if (!gameStartedAt) {
    gameStartedAt = now;
    nextTimedLevelAt = now + 30000;
  }
  if (now >= nextTimedLevelAt) {
    world.level++;
    nextTimedLevelAt += 30000;
    if (world.level >= 5) unlockAchievement("level-5", "Level 5 erreicht");
    for (const player of world.players) {
      if (player.alive) player.snow += 5;
    }
    notify("Level " + world.level + " – die Gegner werden stärker!", 3200);
  }

  for (const player of world.players) {
    if (!player.alive) continue;

    if (player.pendingUpgradeChoices && player.pendingUpgradeChoices.length) {
      player.input = { dx: 0, dy: 0, aimX: Math.cos(player.angle || 0), aimY: Math.sin(player.angle || 0), shoot: false, wall: false, house: false };
      continue;
    }

    const input = player.isLocal
      ? getInput(player)
      : player.input;

    player.input = input;

    if (Math.hypot(input.aimX, input.aimY) > 0.05) {
      player.angle = Math.atan2(input.aimY, input.aimX);
    } else if (Math.hypot(input.dx, input.dy) > 0.05) {
      player.angle = Math.atan2(input.dy, input.dx);
    }

    movePlayer(
      player,
      input.dx * player.speed * dt,
      input.dy * player.speed * dt
    );

    if (input.shoot) shoot(player, now);

    if (input.wall && now - player.lastWall > 450) {
      player.lastWall = now;
      buildStructure(player, "wall");
    }

    if (input.house && now - player.lastHouse > 450) {
      player.lastHouse = now;
      buildStructure(player, "house");
    }

    for (const drop of world.snowballs) {
      if (
        drop.amount > 0 &&
        Math.hypot(player.x - drop.x, player.y - drop.y) <
          player.r + drop.r + 4 + (player.pickupRadius || 0)
      ) {
        player.snow += drop.amount;
        player.totalSnowCollected = (player.totalSnowCollected || 0) + drop.amount;
        if (player.totalSnowCollected >= 100) unlockAchievement("snow-100", "100 Schneebälle gesammelt");
        drop.amount = 0;
        while (player.totalSnowCollected >= (player.nextUpgradeAt || 50)) {
          player.nextUpgradeAt = (player.nextUpgradeAt || 50) + 50;
          if (!player.pendingUpgradeChoices || !player.pendingUpgradeChoices.length) {
            player.pendingUpgradeChoices = makeUpgradeChoices();
            if (player.id === localId) notify("Wähle dein Upgrade!", 3200);
          } else {
            player.queuedUpgrades = (player.queuedUpgrades || 0) + 1;
          }
        }
      }
    }
  }

  world.snowballs = world.snowballs.filter(d => d.amount > 0);

  const spawnInterval = Math.max(400, 1800 - world.level * 90);

  if (now - lastSpawn > spawnInterval) {
    lastSpawn = now;
    const aliveBoss = world.enemies.some(enemy => enemy.type === "boss");
    if (world.level >= 5 && world.level % 5 === 0 && !aliveBoss && world.bossSpawnedAtLevel !== world.level) {
      const target = world.players.find(player => player.alive);
      if (target) {
        world.bossSpawnedAtLevel = world.level;
        const angle = Math.random() * Math.PI * 2, x = target.x + Math.cos(angle) * 620, y = target.y + Math.sin(angle) * 620;
        const hp = 350 + world.level * 45;
        world.enemies.push({id:"boss-"+enemyId++,type:"boss",x,y,r:38,hp,maxHp:hp,damage:58+world.level*2,speed:42+world.level,abilityTimer:2.5,warning:0});
        notify("BOSS-ALARM! Ein Eisriese ist unterwegs!", 4500);
      }
    }
    const count = Math.min(1 + Math.floor(world.level / 3), 4);

    for (let i = 0; i < count; i++) {
      spawnEnemy();
    }
  }

  for (const enemy of world.enemies) {
    let target = null;
    let nearest = Infinity;

    for (const player of world.players) {
      if (!player.alive) continue;

      const distance = Math.hypot(
        player.x - enemy.x,
        player.y - enemy.y
      );

      if (distance < nearest) {
        nearest = distance;
        target = player;
      }
    }

    if (!target) continue;

    const dx = target.x - enemy.x, dy = target.y - enemy.y;
    const length = Math.hypot(dx, dy) || 1;
    enemy.abilityTimer = (enemy.abilityTimer ?? 3) - dt;
    enemy.warning = Math.max(0, (enemy.warning || 0) - dt);
    let speed = enemy.speed;
    if (enemy.type === "phantom" && enemy.abilityTimer <= 0) { speed *= 2.8; enemy.abilityTimer = 4.2; }
    if (enemy.type === "boss" && enemy.abilityTimer <= 0) { enemy.warning = 0.9; enemy.abilityTimer = 5.2; }
    if (enemy.type === "boss" && enemy.warning > 0) speed *= 0.15;
    const nx = enemy.x + dx / length * speed * dt;
    const ny = enemy.y + dy / length * speed * dt;

    if (!blocked(nx, ny, enemy.r)) {
      enemy.x = nx;
      enemy.y = ny;
    }

    if (enemy.type === "boss" && enemy.warning > 0 && enemy.warning < dt + 0.04) {
      for (const player of world.players) {
        if (player.alive && Math.hypot(player.x - enemy.x, player.y - enemy.y) < 155) {
          player.hp -= 24 * (1 - Math.min(0.7, player.damageReduction || 0));
          if (player.hp <= 0) { player.hp = 0; player.alive = false; dropSnow(player.x, player.y, 8); }
        }
      }
    }
    if (
      Math.hypot(target.x - enemy.x, target.y - enemy.y) <
      enemy.r + target.r
    ) {
      target.hp -= (enemy.damage || 24) * (1 - Math.min(0.7, target.damageReduction || 0)) * dt;

      if (target.hp <= 0) {
        target.hp = 0;
        target.alive = false;
        dropSnow(target.x, target.y, 8);
      }
    }
  }

  for (const shot of world.shots) {
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    shot.life -= dt;

    let hitStructure = false;
    for (const wall of world.walls) {
      if (shot.x >= wall.x && shot.x <= wall.x + wall.w && shot.y >= wall.y && shot.y <= wall.y + wall.h) {
        wall.hp = (wall.hp ?? 3) - 1; shot.life = 0; hitStructure = true;
        if (wall.hp <= 0) world.walls = world.walls.filter(item => item !== wall);
        break;
      }
    }
    if (!hitStructure) for (const house of world.houses) {
      if (shot.x >= house.x && shot.x <= house.x + house.w && shot.y >= house.y && shot.y <= house.y + house.h) {
        house.hp = (house.hp ?? 8) - 1; shot.life = 0; hitStructure = true;
        if (house.hp <= 0) world.houses = world.houses.filter(item => item !== house);
        break;
      }
    }
    if (hitStructure) continue;
    for (const enemy of world.enemies) {
      if (enemy.hp <= 0 || (shot.hitIds || []).includes(enemy.id)) continue;

      if (
        Math.hypot(shot.x - enemy.x, shot.y - enemy.y) <
        shot.r + enemy.r
      ) {
        enemy.hp -= shot.damage || 25;
        shot.hitIds = shot.hitIds || []; shot.hitIds.push(enemy.id);
        if ((shot.blastRadius || 0) > 0) {
          for (const nearby of world.enemies) if (nearby !== enemy && nearby.hp > 0 && Math.hypot(nearby.x - enemy.x, nearby.y - enemy.y) <= shot.blastRadius) nearby.hp -= (shot.damage || 25) * 0.45;
        }
        if ((shot.piercing || 0) > 0) shot.piercing--; else shot.life = 0;

        if (enemy.hp <= 0) {
          world.kills = (world.kills || 0) + 1;
          if (world.kills >= 1) unlockAchievement("first-kill", "Erster Gegner");
          if (world.kills >= 50) unlockAchievement("hunter-50", "Jäger: 50 Gegner");
          if (enemy.type === "boss") { world.bossDefeated = (world.bossDefeated || 0) + 1; unlockAchievement("first-boss", "Eisriese besiegt"); dropSnow(enemy.x, enemy.y, 25); }
          dropSnow(enemy.x, enemy.y, 3 + Math.floor(Math.random() * 4));
        }

        break;
      }
    }
  }

  world.shots = world.shots.filter(shot => shot.life > 0).slice(-400);
  world.snowballs = world.snowballs.slice(-300);
  world.walls = world.walls.slice(-100);
  world.houses = world.houses.slice(-60);
  const livingPlayers = world.players.filter(player => player.alive);
  world.enemies = world.enemies.filter(enemy => enemy.hp > 0 && (!livingPlayers.length || livingPlayers.some(player => Math.hypot(player.x - enemy.x, player.y - enemy.y) < 2600)));

  // Levelaufstieg läuft zeitbasiert oben in updateHost, nicht nur wenn
  // zufällig gerade keine Gegner auf der Karte sind.

  if (
    world.players.length > 0 &&
    world.players.every(player => !player.alive)
  ) {
    gameOver = true;
    notify("Game Over!", 100000);
  }
}

