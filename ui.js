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
  const over = document.getElementById("runOverOverlay");
  if (over) over.classList.add("hidden");
  const meta = document.getElementById("metaOverlay");
  if (meta) meta.classList.add("hidden");
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
  if (wheelOverlay) {
    wheelOverlay.classList.toggle("hidden", !(player && player.pendingWheel));
    wheelOverlay.style.zIndex = "12020";
    const spin = document.getElementById("spinWheelBtn");
    if (spin && player && player.pendingWheel) { spin.disabled = false; spin.textContent = "Glücksrad drehen"; }
  }
  const runOverOverlay = document.getElementById("runOverOverlay");
  if (runOverOverlay) runOverOverlay.classList.toggle("hidden", !gameOver);
  const collected = player ? (player.totalSnowCollected || 0) : 0, nextAt = player ? (player.nextUpgradeAt || 25) : 25;
  const level = player ? (player.level || 1) : 1;
  const needed = 25 + Math.max(0, level - 1) * 15;
  const progress = Math.max(0, Math.min(100, (collected - (nextAt - needed)) / needed * 100));
  if (upgradeProgress) upgradeProgress.style.width = progress + "%";
  if (upgradeProgressText) upgradeProgressText.textContent = Math.max(0, nextAt - collected) + " Schneebälle bis Level " + (level + 1);
  const healthFill=document.getElementById("playerHealthFill"), healthText=document.getElementById("playerHealthText");
  if(healthFill) healthFill.style.width=(player?Math.max(0,Math.min(100,(player.hp||0)/(player.maxHp||100)*100)):0)+"%";
  if(healthText) healthText.textContent=player?Math.ceil(player.hp||0)+" / "+(player.maxHp||100)+" HP":"0 / 100 HP";
  const healthHud=document.getElementById("playerHealthHud");
  if(healthHud) healthHud.classList.toggle("low-health",!!player&&player.hp/(player.maxHp||100)<0.3);
  const boss = world.enemies.find(enemy => enemy.type === "boss");
  if (bossBar) bossBar.classList.toggle("hidden", !boss);
  if (bossBarFill) bossBarFill.style.width = boss ? Math.max(0, Math.min(100, boss.hp / boss.maxHp * 100)) + "%" : "0%";
  if (bossBarLabel) bossBarLabel.textContent = boss ? "EISRIESE · " + Math.ceil(boss.hp) + " / " + boss.maxHp : "";
  if (gameOverStats && gameOver) gameOverStats.textContent = "Level " + world.level + " · " + (world.kills || 0) + " Gegner besiegt · " + (world.bossDefeated || 0) + " Bosse besiegt · " + Math.floor((performance.now() - gameStartedAt) / 1000) + " Sekunden überlebt";
  renderUpgradeChoices(player);

  playerList.replaceChildren();

  for (const p of world.players) {
    const item = document.createElement("li");
    item.textContent =
      p.name +
      (p.id === localId ? " (Du)" : "") +
      (!p.alive ? " – am Boden" : " · Level " + (p.level || 1));

    playerList.appendChild(item);
  }

  if (noticeUntil && now > noticeUntil && !gameOver) {
    notice.textContent = "";
    noticeUntil = 0;
  }
}


const runRestartBtn = document.getElementById("runRestartBtn");
if (runRestartBtn) runRestartBtn.addEventListener("click", () => {
  const restart = document.getElementById("restartBtn");
  if (restart) restart.click();
});
const runMenuBtn = document.getElementById("runMenuBtn");
if (runMenuBtn) runMenuBtn.addEventListener("click", () => returnToMenu());

/* Persistent cosmetics and free battle-pass reward track */
const META_SKINS = [
  {id:"classic",name:"Klassischer Pinguin",cost:0,color:"#202b35",description:"Der ursprüngliche Pinguin."},
  {id:"arctic",name:"Arktis",cost:40,color:"#52cde8",description:"Eisblauer Look."},
  {id:"forest",name:"Waldläufer",cost:60,color:"#2b7a56",description:"Dunkelgrüner Outdoor-Look."},
  {id:"magma",name:"Magma",cost:80,color:"#c84b35",description:"Rot-oranger seltener Skin."},
  {id:"royal",name:"Königlich",cost:120,color:"#7652b8",description:"Violetter Premium-Look."},
  {id:"gold",name:"Goldpinguin",cost:200,color:"#d6a72c",description:"Goldener Endgame-Skin."}
];
let metaPreviewSkin = "classic";
let metaWasPaused = false;
function openMetaPanel() {
  const overlay = document.getElementById("metaOverlay");
  if (!overlay) return;
  metaWasPaused = paused;
  if (running && !paused && !gameOver) setPaused(true);
  overlay.classList.remove("hidden");
  renderMetaPanel();
}
function closeMetaPanel() {
  const overlay = document.getElementById("metaOverlay");
  if (overlay) overlay.classList.add("hidden");
  if (running && !gameOver && !metaWasPaused) setPaused(false);
}
function renderMetaPanel() {
  const meta = loadMetaProgress();
  const coinsNode=document.getElementById("metaCoins"), xpNode=document.getElementById("metaXP");
  if(coinsNode) coinsNode.textContent=String(meta.coins||0);
  if(xpNode) xpNode.textContent=String(meta.passXP||0);
  const xp=Number(meta.passXP)||0, next=((Math.floor(xp/5)+1)*5);
  const textNode=document.getElementById("metaPassText"), fill=document.getElementById("metaPassFill");
  if(textNode) textNode.textContent=(next-xp)+" Gegner bis zur nächsten Pass-Box · jede Box gibt Münzen.";
  if(fill) fill.style.width=((xp%5)/5*100)+"%";
  const track=document.getElementById("metaBoxTrack");
  if(track){
    track.replaceChildren();
    const claimed=new Set(meta.claimedBoxes||[]);
    const total=Math.max(5,Math.ceil(xp/5)*5);
    for(let milestone=5;milestone<=total+5;milestone+=5){
      const box=document.createElement("button");
      box.className="meta-box"+(xp>=milestone?" ready":"");
      box.textContent=claimed.has(milestone)?"✓":(xp>=milestone?"🎁":"🔒");
      box.title="Pass-Box bei "+milestone+" EP";
      box.disabled=xp<milestone||claimed.has(milestone);
      box.addEventListener("click",()=>{
        const latest=loadMetaProgress();latest.claimedBoxes=Array.isArray(latest.claimedBoxes)?latest.claimedBoxes:[];
        if((latest.passXP||0)<milestone||latest.claimedBoxes.includes(milestone))return;
        latest.claimedBoxes.push(milestone);latest.coins=(latest.coins||0)+35+Math.floor(Math.random()*26);
        try{localStorage.setItem("attackePinguinMeta",JSON.stringify(latest));}catch(_){}
        const p=localPlayer();if(p){p.coins=latest.coins;}
        notify("Pass-Box geöffnet: Münzen erhalten!",2500);renderMetaPanel();
      });
      track.appendChild(box);
    }
  }
  const shop=document.getElementById("skinShop");
  if(shop){
    shop.replaceChildren();
    const owned=new Set(meta.ownedSkins||["classic"]);
    for(const skin of META_SKINS){
      const card=document.createElement("div");card.className="skin-card"+(metaPreviewSkin===skin.id?" selected":"");
      const preview=document.createElement("div");preview.className="skin-preview";preview.style.background=skin.color;preview.textContent="🐧";
      const title=document.createElement("strong");title.textContent=skin.name;
      const desc=document.createElement("p");desc.textContent=skin.description;
      const cost=document.createElement("small");cost.textContent=owned.has(skin.id)?"Freigeschaltet":skin.cost+" Münzen";
      const previewBtn=document.createElement("button");previewBtn.className="secondary";previewBtn.textContent="Ansehen";
      previewBtn.addEventListener("click",()=>{metaPreviewSkin=skin.id;const n=document.getElementById("skinPreviewText");if(n)n.textContent=skin.name+": "+skin.description;renderMetaPanel();});
      const buyBtn=document.createElement("button");buyBtn.className="primary";
      if(owned.has(skin.id)){
        buyBtn.textContent=meta.skin===skin.id?"Ausgewählt":"Auswählen";
        buyBtn.addEventListener("click",()=>{const latest=loadMetaProgress();latest.skin=skin.id;try{localStorage.setItem("attackePinguinMeta",JSON.stringify(latest));}catch(_){}const p=localPlayer();if(p)p.skin=skin.id;metaPreviewSkin=skin.id;renderMetaPanel();notify(skin.name+" ausgerüstet!",1800);});
      }else{
        buyBtn.textContent="Kaufen";
        buyBtn.disabled=metaPreviewSkin!==skin.id||(meta.coins||0)<skin.cost;
        buyBtn.addEventListener("click",()=>{const latest=loadMetaProgress();if(metaPreviewSkin!==skin.id||(latest.coins||0)<skin.cost)return;latest.coins-=skin.cost;latest.ownedSkins=Array.isArray(latest.ownedSkins)?latest.ownedSkins:["classic"];if(!latest.ownedSkins.includes(skin.id))latest.ownedSkins.push(skin.id);try{localStorage.setItem("attackePinguinMeta",JSON.stringify(latest));}catch(_){}const p=localPlayer();if(p)p.coins=latest.coins;notify(skin.name+" gekauft! Du kannst ihn jetzt auswählen.",2200);renderMetaPanel();});
      }
      card.append(preview,title,desc,cost,previewBtn,buyBtn);shop.appendChild(card);
    }
  }
}
for(const id of ["openMetaMenuBtn","openMetaGameBtn"]){const btn=document.getElementById(id);if(btn)btn.addEventListener("click",openMetaPanel);}
const closeMetaBtn=document.getElementById("closeMetaBtn");if(closeMetaBtn)closeMetaBtn.addEventListener("click",closeMetaPanel);
const metaOverlay=document.getElementById("metaOverlay");if(metaOverlay)metaOverlay.addEventListener("click",event=>{if(event.target===metaOverlay)closeMetaPanel();});
