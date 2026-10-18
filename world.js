/* Attacke Pinguin – world */

function resetWorld() {
  world.width = 1800;
  world.height = 1400;
  world.level = 1;
  world.players = [];
  world.enemies = [];
  world.snowballs = [];
  world.walls = [];
  world.houses = [];
  world.shots = [];

  enemyId = 1;
  lastSpawn = 0;
  gameStartedAt = 0;
  nextTimedLevelAt = 0;
  gameOver = false;
  paused = false;
  if (pauseOverlay) pauseOverlay.classList.add("hidden");
  joinedGame = false;
  joiningSent = false;
}



function blocked(x, y, radius) {
  for (const wall of world.walls) {
    if (
      x + radius > wall.x &&
      x - radius < wall.x + wall.w &&
      y + radius > wall.y &&
      y - radius < wall.y + wall.h
    ) return true;
  }

  for (const house of world.houses) {
    if (
      x + radius > house.x &&
      x - radius < house.x + house.w &&
      y + radius > house.y &&
      y - radius < house.y + house.h
    ) return true;
  }

  return false;
}







function ensureEndlessWorld() {
  // Wichtig: Niemals Spieler oder Weltobjekte verschieben. Das verursachte
  // Teleports, sobald jemand in die Nähe des alten Kartenrands kam.
  // Die Spielfläche hat keine Begrenzung; diese Werte dienen nur der Minimap
  // und werden rein anhand positiver Koordinaten vergrößert.
  for (const p of world.players) {
    if (p.x > world.width - 600) world.width = Math.ceil((p.x + 1200) / 600) * 600;
    if (p.y > world.height - 500) world.height = Math.ceil((p.y + 1000) / 500) * 500;
  }
}



function updateCamera() {
  const player = localPlayer();
  if (!player) return;

  // Die Kamera kennt keine Kartenkanten und folgt dem Spieler überallhin.
  camera.x = player.x - VIEW_W / 2;
  camera.y = player.y - VIEW_H / 2;
}


function drawGround() {
  ctx.fillStyle = "#d8edf0";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.strokeStyle = "#c5e0e5";
  ctx.lineWidth = 1;

  const grid = 80;

  for (let x = -(camera.x % grid); x < VIEW_W; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, VIEW_H);
    ctx.stroke();
  }

  for (let y = -(camera.y % grid); y < VIEW_H; y += grid) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(VIEW_W, y);
    ctx.stroke();
  }
}


function drawPlayer(player) {
  const x = player.x - camera.x;
  const y = player.y - camera.y;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(player.angle);

  // Pinguinkörper
  ctx.fillStyle = player.alive ? "#202b35" : "#737e83";
  ctx.beginPath();
  ctx.ellipse(0, 0, 18, 22, 0, 0, Math.PI * 2);
  ctx.fill();

  // Bauch
  ctx.fillStyle = "#f5f7f5";
  ctx.beginPath();
  ctx.ellipse(3, 5, 10, 13, 0, 0, Math.PI * 2);
  ctx.fill();

  // Schnabel zeigt in Blickrichtung
  ctx.fillStyle = "#f7a83e";
  ctx.beginPath();
  ctx.moveTo(12, -4);
  ctx.lineTo(26, 0);
  ctx.lineTo(12, 5);
  ctx.closePath();
  ctx.fill();

  // Auge
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(7, -8, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(8, -8, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  ctx.textAlign = "center";
  ctx.font = "12px Arial";
  ctx.fillStyle = "#10202a";
  ctx.fillText(player.name, x, y - 30);

  ctx.fillStyle = "#9b3434";
  ctx.fillRect(x - 19, y + 27, 38, 5);

  ctx.fillStyle = "#62d46b";
  ctx.fillRect(
    x - 19,
    y + 27,
    38 * clamp(player.hp / 100, 0, 1),
    5
  );

  if (!player.alive) {
    ctx.fillStyle = "#9b3434";
    ctx.fillText("KO", x, y + 45);
  }
}


function drawWorld() {
  drawGround();

  for (const house of world.houses) {
    const x=house.x-camera.x,y=house.y-camera.y;
    ctx.fillStyle="#e8f8fc";ctx.beginPath();ctx.ellipse(x+house.w/2,y+house.h*0.62,house.w/2,house.h*0.58,0,Math.PI,0);
    ctx.lineTo(x+house.w,y+house.h*0.82);ctx.quadraticCurveTo(x+house.w/2,y+house.h*1.15,x,y+house.h*0.82);ctx.closePath();ctx.fill();
    ctx.strokeStyle="#8bbac8";ctx.lineWidth=2;ctx.stroke();ctx.strokeStyle="#b0dce7";ctx.lineWidth=1;
    for(let row=0;row<3;row++){const yy=y+10+row*10;ctx.beginPath();ctx.moveTo(x+8,yy);ctx.lineTo(x+house.w-8,yy);ctx.stroke();}
    ctx.fillStyle="#83b8c9";ctx.beginPath();ctx.arc(x+house.w/2,y+house.h-2,9,Math.PI,0);ctx.fill();
  }
  for (const wall of world.walls) {
    ctx.fillStyle = "#79a5b1";
    ctx.fillRect(
      wall.x - camera.x,
      wall.y - camera.y,
      wall.w,
      wall.h
    );

    ctx.strokeStyle = "#4c7885";
    ctx.strokeRect(
      wall.x - camera.x,
      wall.y - camera.y,
      wall.w,
      wall.h
    );
  }

  for (const drop of world.snowballs) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(
      drop.x - camera.x,
      drop.y - camera.y,
      drop.r,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.strokeStyle = "#86b6c6";
    ctx.stroke();
  }

  for (const shot of world.shots) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(
      shot.x - camera.x,
      shot.y - camera.y,
      shot.r,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  for (const enemy of world.enemies) {
    const x = enemy.x - camera.x;
    const y = enemy.y - camera.y;

    const enemyColors = {
      normal: "#c74343", heavy: "#e27b32", ice: "#39b9d5",
      armored: "#687783", elite: "#d83c91", boss: "#7e45b8",
      crystal: "#39d9a7", phantom: "#5144a8"
    };
    ctx.fillStyle = enemyColors[enemy.type] || enemyColors.normal;
    ctx.beginPath();
    if (enemy.type === "crystal") {
      // Kristallgegner: kantige, sechszackige Silhouette.
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3 - Math.PI / 2;
        const px = x + Math.cos(a) * (i % 2 === 0 ? enemy.r + 5 : enemy.r * 0.72);
        const py = y + Math.sin(a) * (i % 2 === 0 ? enemy.r + 5 : enemy.r * 0.72);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else if (enemy.type === "phantom") {
      // Phantomgegner: rautenförmiger Schatten mit Spitzen.
      ctx.moveTo(x, y - enemy.r - 7);
      ctx.lineTo(x + enemy.r * 0.72, y - enemy.r * 0.15);
      ctx.lineTo(x + enemy.r, y + enemy.r * 0.75);
      ctx.lineTo(x, y + enemy.r * 0.45);
      ctx.lineTo(x - enemy.r, y + enemy.r * 0.75);
      ctx.lineTo(x - enemy.r * 0.72, y - enemy.r * 0.15);
      ctx.closePath();
    } else if (enemy.type === "ice") {
      ctx.moveTo(x, y - enemy.r - 4);
      ctx.lineTo(x + enemy.r, y);
      ctx.lineTo(x, y + enemy.r + 4);
      ctx.lineTo(x - enemy.r, y);
      ctx.closePath();
    } else if (enemy.type === "elite" || enemy.type === "boss") {
      const spikes = enemy.type === "boss" ? 12 : 8;
      for (let i = 0; i < spikes * 2; i++) {
        const a = i * Math.PI / spikes;
        const radius = i % 2 === 0 ? enemy.r + 5 : enemy.r * 0.78;
        const px = x + Math.cos(a) * radius, py = y + Math.sin(a) * radius;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else {
      ctx.arc(x, y, enemy.r, 0, Math.PI * 2);
    }
    ctx.fill();
    if (enemy.type === "armored") {
      ctx.strokeStyle = "#d7e0e5";
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, enemy.r * 0.58, 0, Math.PI * 2); ctx.stroke();
    } else if (enemy.type === "ice") {
      ctx.strokeStyle = "#d8fbff"; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x-enemy.r*0.45,y); ctx.lineTo(x+enemy.r*0.45,y); ctx.stroke();
    } else if (enemy.type === "elite" || enemy.type === "boss") {
      ctx.strokeStyle = enemy.type === "boss" ? "#e6c8ff" : "#ffc6e4";
      ctx.lineWidth = 3; ctx.stroke();
    } else if (enemy.type === "crystal" || enemy.type === "phantom") {
      ctx.strokeStyle = enemy.type === "crystal" ? "#d1fff1" : "#c9c1ff";
      ctx.lineWidth = 3; ctx.stroke();
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(x, y, enemy.r * 0.55, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x - 5, y - 4, 3, 0, Math.PI * 2);
    ctx.arc(x + 5, y - 4, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#542020";
    ctx.fillRect(x - 18, y - enemy.r - 10, 36, 4);

    ctx.fillStyle = "#ff7474";
    ctx.fillRect(
      x - 18,
      y - enemy.r - 10,
      36 * clamp(enemy.hp / enemy.maxHp, 0, 1),
      4
    );
  }

  for (const player of world.players) {
    drawPlayer(player);
  }

  if (gameOver) {
    ctx.fillStyle = "#08131bd9";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    ctx.textAlign = "center";
    ctx.fillStyle = "#ff7b72";
    ctx.font = "bold 48px Arial";
    ctx.fillText("GAME OVER", VIEW_W / 2, VIEW_H / 2);
  }
}


function drawMinimap() {
  const w = mini.width;
  const h = mini.height;

  mctx.fillStyle = "#d8edf0";
  mctx.fillRect(0, 0, w, h);

  const sx = w / world.width;
  const sy = h / world.height;

  mctx.fillStyle = "#a9784e";

  for (const house of world.houses) {
    mctx.fillRect(
      house.x * sx,
      house.y * sy,
      Math.max(2, house.w * sx),
      Math.max(2, house.h * sy)
    );
  }

  mctx.fillStyle = "#719daa";

  for (const wall of world.walls) {
    mctx.fillRect(
      wall.x * sx,
      wall.y * sy,
      Math.max(2, wall.w * sx),
      Math.max(2, wall.h * sy)
    );
  }

  mctx.fillStyle = "#c74343";

  for (const enemy of world.enemies) {
    mctx.beginPath();
    mctx.arc(enemy.x * sx, enemy.y * sy, 2.4, 0, Math.PI * 2);
    mctx.fill();
  }

  for (const player of world.players) {
    mctx.fillStyle = player.id === localId ? "#25821f" : "#1673bd";
    mctx.beginPath();
    mctx.arc(player.x * sx, player.y * sy, 3.5, 0, Math.PI * 2);
    mctx.fill();
  }

  mctx.strokeStyle = "#375b68";
  mctx.strokeRect(0, 0, w, h);
}

