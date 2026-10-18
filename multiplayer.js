/* Attacke Pinguin – multiplayer */

function closeNetwork() {
  if (hostConnection) {
    try {
      hostConnection.close();
    } catch (_) {}
  }

  hostConnection = null;

  for (const conn of connections.values()) {
    try {
      conn.close();
    } catch (_) {}
  }

  for (const conn of pendingConnections) {
    try {
      conn.close();
    } catch (_) {}
  }

  connections.clear();
  pendingConnections.clear();

  if (peer) {
    try {
      peer.destroy();
    } catch (_) {}
  }

  peer = null;
  online = false;
  isHost = false;
  joinedGame = false;
}


function createPeer(id) {
  return new Promise((resolve, reject) => {
    if (typeof Peer === "undefined") {
      reject(new Error("PeerJS konnte nicht geladen werden."));
      return;
    }

    const newPeer = new Peer(id, { debug: 0 });
    let opened = false;

    const timeout = setTimeout(() => {
      if (!opened) {
        try {
          newPeer.destroy();
        } catch (_) {}
        reject(new Error("Zeitüberschreitung beim Verbinden."));
      }
    }, 15000);

    newPeer.on("open", () => {
      opened = true;
      clearTimeout(timeout);
      peer = newPeer;
      resolve(newPeer);
    });

    newPeer.on("error", err => {
      if (!opened) {
        clearTimeout(timeout);
        reject(err);
      } else {
        console.error("PeerJS:", err);
      }
    });

    newPeer.on("disconnected", () => {
      if (running && online) {
        connectionLabel.textContent = "Verbindung unterbrochen";
      }
    });
  });
}


function createRoomCode() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}


async function createOnlineRoom() {
  closeNetwork();
  resetWorld();

  isHost = true;
  online = true;
  roomCode = createRoomCode();
  localId = makeId("host-");

  menuStatus("Online-Raum wird erstellt ...");

  try {
    await createPeer("ap-" + roomCode.toLowerCase());

    world.players.push(
      makePlayer(localId, getName(), 220, 220, true)
    );

    peer.on("connection", handleIncomingConnection);

    startGame();
    notify("Dein Raumcode: " + roomCode, 7000);
  } catch (error) {
    closeNetwork();
    menuStatus(
      "Raum konnte nicht erstellt werden. Bitte erneut versuchen."
    );
    console.error(error);
  }
}


function handleIncomingConnection(conn) {
  const currentConnections =
    connections.size + pendingConnections.size;

  if (currentConnections >= MAX_PLAYERS - 1) {
    conn.on("open", () => {
      try {
        conn.send({
          type: "full",
          message: "Der Raum ist voll. Maximal 10 Spieler."
        });
      } catch (_) {}

      setTimeout(() => {
        try {
          conn.close();
        } catch (_) {}
      }, 300);
    });
    return;
  }

  pendingConnections.add(conn);

  conn.on("open", () => {
    pendingConnections.delete(conn);
    connections.set(conn.peer, conn);

    /*
     * Wichtig: Hier wird noch kein Spieler erzeugt.
     * Erst die join-Nachricht erzeugt genau einen Spieler.
     */
    conn.send({
      type: "welcome",
      room: roomCode,
      maxPlayers: MAX_PLAYERS
    });
  });

  conn.on("data", data => {
    if (!data || typeof data !== "object") return;

    if (data.type === "join") {
      handlePlayerJoin(conn, data);
      return;
    }

    if (data.type === "input" && conn.playerId) {
      const player = world.players.find(
        p => p.id === conn.playerId
      );

      if (!player) return;

      player.input = sanitizeInput(data.input);
      player.name = String(data.name || player.name).slice(0, 16);
      return;
    }

    if (data.type === "build" && conn.playerId) {
      const player = world.players.find(
        p => p.id === conn.playerId
      );

      if (!player || !player.alive) return;

      if (data.building === "wall") {
        buildStructure(player, "wall");
      } else if (data.building === "house") {
        buildStructure(player, "house");
      }
      return;
    }

    if (data.type === "upgrade" && conn.playerId) {
      const player = world.players.find(p => p.id === conn.playerId);
      if (player) applyUpgradeChoice(player, String(data.upgradeId || ""));
      return;
    }

    if (data.type === "leave" && conn.playerId) {
      removePlayer(conn.playerId);
      conn.playerId = null;
    }
  });

  conn.on("close", () => {
    pendingConnections.delete(conn);
    connections.delete(conn.peer);

    if (conn.playerId) {
      removePlayer(conn.playerId);
      conn.playerId = null;
    }
  });

  conn.on("error", () => {
    pendingConnections.delete(conn);
    connections.delete(conn.peer);

    if (conn.playerId) {
      removePlayer(conn.playerId);
      conn.playerId = null;
    }
  });
}


function handlePlayerJoin(conn, data) {
  // Verhindert, dass ein Client mehrere Spieler erzeugt.
  if (conn.playerId) {
    sendSnapshotTo(conn);
    return;
  }

  if (world.players.length >= MAX_PLAYERS) {
    try {
      conn.send({
        type: "full",
        message: "Der Raum ist voll. Maximal 10 Spieler."
      });
    } catch (_) {}
    return;
  }

  const id = makeId("guest-");

  const player = makePlayer(
    id,
    String(data.name || "Pinguin").slice(0, 16),
    random(100, world.width - 100),
    random(100, world.height - 100),
    false
  );

  conn.playerId = id;
  world.players.push(player);

  // Erst ID senden, dann den aktuellen Spielstand übertragen.
  conn.send({
    type: "joined",
    id,
    room: roomCode,
    maxPlayers: MAX_PLAYERS
  });

  broadcastSnapshot();
}


function sanitizeInput(input) {
  if (!input || typeof input !== "object") {
    return {
      dx: 0, dy: 0, aimX: 1, aimY: 0,
      shoot: false, wall: false, house: false
    };
  }

  return {
    dx: clamp(Number(input.dx) || 0, -1, 1),
    dy: clamp(Number(input.dy) || 0, -1, 1),
    aimX: clamp(Number(input.aimX) || 0, -1, 1),
    aimY: clamp(Number(input.aimY) || 0, -1, 1),
    shoot: !!input.shoot,
    wall: !!input.wall,
    house: !!input.house
  };
}


async function joinOnlineRoom() {
  const code = roomInput.value.trim().toUpperCase();

  if (!/^[A-Z0-9]{5}$/.test(code)) {
    menuStatus("Gib den fünfstelligen Raumcode ein.");
    return;
  }

  closeNetwork();
  resetWorld();

  isHost = false;
  online = true;
  roomCode = code;
  localId = "";

  menuStatus("Verbinde mit Raum " + code + " ...");

  try {
    /*
     * Jeder Mitspieler erhält eine eigene Peer-ID.
     * Die Verbindung zum Host wird danach geöffnet.
     */
    await createPeer(makeId("client-"));

    hostConnection = peer.connect(
      "ap-" + code.toLowerCase(),
      { reliable: true }
    );

    /*
     * Wichtig: Daten-Listener werden VOR dem Warten auf open
     * registriert. Dadurch wird die welcome-Nachricht nicht verpasst.
     */
    hostConnection.on("data", data => {
      if (!data || typeof data !== "object") return;

      if (data.type === "full") {
        menuStatus(data.message || "Der Raum ist voll.");
        returnToMenu();
        return;
      }

      if (data.type === "welcome") {
        if (!joiningSent) {
          joiningSent = true;
          hostConnection.send({
            type: "join",
            name: getName()
          });
        }
        return;
      }

      if (data.type === "joined") {
        localId = data.id;
        roomCode = data.room || roomCode;

        startGame();
        notify("Du bist der Gruppe beigetreten.");
        return;
      }

      if (data.type === "snapshot") {
        if (!paused) applySnapshot(data.world);
      }
    });

    hostConnection.on("open", () => {
      connectionLabel.textContent = "Verbindung hergestellt";
    });

    hostConnection.on("close", () => {
      if (running) {
        connectionLabel.textContent = "Verbindung zum Host verloren";
        notify("Die Verbindung zum Host wurde getrennt.", 6000);
      }
    });

    hostConnection.on("error", error => {
      console.error("Host-Verbindung:", error);
      menuStatus("Verbindung fehlgeschlagen. Prüfe den Raumcode.");
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Host nicht erreichbar.")),
        15000
      );

      hostConnection.on("open", () => {
        clearTimeout(timeout);
        resolve(true);
      });

      hostConnection.on("error", error => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  } catch (error) {
    console.error(error);
    closeNetwork();
    menuStatus(
      "Beitritt fehlgeschlagen. Prüfe den Code und ob der Host noch spielt."
    );
  }
}


function removePlayer(id) {
  world.players = world.players.filter(p => p.id !== id);
  broadcastSnapshot();
}


function makeSnapshot() {
  return {
    width: world.width,
    height: world.height,
    level: world.level,

    players: world.players.map(p => ({
      id: p.id,
      name: p.name,
      x: p.x,
      y: p.y,
      r: p.r,
      angle: p.angle,
      hp: p.hp,
      snow: p.snow,
      totalSnowCollected: p.totalSnowCollected || 0,
      weaponLevel: p.weaponLevel || 1,
      nextUpgradeAt: p.nextUpgradeAt || 50,
      pendingUpgradeChoices: p.pendingUpgradeChoices || [],
      queuedUpgrades: p.queuedUpgrades || 0,
      damageBonus: p.damageBonus || 0,
      fireRateMultiplier: p.fireRateMultiplier || 1,
      extraProjectiles: p.extraProjectiles || 0,
      pickupRadius: p.pickupRadius || 0,
      damageReduction: p.damageReduction || 0,
      maxHp: p.maxHp || 100,
      alive: p.alive
    })),

    enemies: world.enemies,
    snowballs: world.snowballs,
    walls: world.walls,
    houses: world.houses,
    shots: world.shots
  };
}


function sendSnapshotTo(conn) {
  if (!conn || !conn.open) return;

  try {
    conn.send({
      type: "snapshot",
      world: makeSnapshot()
    });
  } catch (error) {
    console.error("Snapshot konnte nicht gesendet werden:", error);
  }
}


function broadcastSnapshot() {
  if (!isHost || !online) return;

  for (const conn of connections.values()) {
    sendSnapshotTo(conn);
  }
}


function applySnapshot(data) {
  if (!data) return;

  world.width = data.width;
  world.height = data.height;
  world.level = data.level;

  world.players = data.players || [];
  world.enemies = data.enemies || [];
  world.snowballs = data.snowballs || [];
  world.walls = data.walls || [];
  world.houses = data.houses || [];
  world.shots = data.shots || [];
}



function sendClientInput(now) {
  if (!online || isHost || !hostConnection || !hostConnection.open) {
    return;
  }

  if (now - lastInputSend < 40) return;
  lastInputSend = now;

  const player = localPlayer();
  if (!player) return;

  hostConnection.send({
    type: "input",
    name: getName(),
    input: getInput(player)
  });
}

