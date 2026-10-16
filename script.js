(() => {
  "use strict";

  const COLS = 10, ROWS = 20, CELL = 30;
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const nextCanvas = document.getElementById("nextCanvas");
  const nextCtx = nextCanvas.getContext("2d");

  const scoreEl = document.getElementById("score");
  const linesEl = document.getElementById("lines");
  const levelEl = document.getElementById("level");
  const bestEl = document.getElementById("best");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayMessage = document.getElementById("overlayMessage");
  const startBtn = document.getElementById("startBtn");
  const statusText = document.getElementById("statusText");

  const TYPES = [
    { name:"I", color:"#3d8fd1", shape:[[1,1,1,1]], label:"USO" },
    { name:"O", color:"#d8aa37", shape:[[1,1],[1,1]], label:"CLASSE" },
    { name:"T", color:"#9b70bd", shape:[[0,1,0],[1,1,1]], label:"SÉRIE" },
    { name:"S", color:"#43976b", shape:[[0,1,1],[1,1,0]], label:"DOC." },
    { name:"Z", color:"#c95748", shape:[[1,1,0],[0,1,1]], label:"DOC." },
    { name:"J", color:"#4b79b8", shape:[[1,0,0],[1,1,1]], label:"ARQ." },
    { name:"L", color:"#c78f58", shape:[[0,0,1],[1,1,1]], label:"CX." }
  ];

  let board, current, next, score = 0, lines = 0, level = 1;
  let running = false, paused = false, gameOver = false;
  let clearing = false, flashingRows = [], clearStartedAt = 0;
  const CLEAR_FLASH_DURATION = 720;
  let dropCounter = 0, lastTime = 0, animationId = null;
  let best = Number(localStorage.getItem("tetrisArquivoBest") || 0);
  bestEl.textContent = formatScore(best);

  function formatScore(n) { return String(n).padStart(6, "0"); }
  function emptyBoard() { return Array.from({length: ROWS}, () => Array(COLS).fill(null)); }
  function cloneShape(shape) { return shape.map(row => row.slice()); }
  function randomPiece() {
    const type = TYPES[Math.floor(Math.random() * TYPES.length)];
    return { ...type, shape: cloneShape(type.shape), x: Math.floor(COLS / 2) - Math.ceil(type.shape[0].length / 2), y: -1 };
  }

  function drawBox(context, x, y, size, color, label = "ARQ.") {
    const px = x * size, py = y * size;
    context.save();
    // Shadow and cardboard body
    context.fillStyle = "rgba(0,0,0,.28)";
    context.fillRect(px + 2, py + 3, size - 2, size - 2);
    context.fillStyle = color;
    context.fillRect(px + 1, py + 1, size - 3, size - 3);
    // Bevel / top light
    context.fillStyle = "rgba(255,255,255,.24)";
    context.fillRect(px + 2, py + 2, size - 5, 3);
    context.fillStyle = "rgba(0,0,0,.18)";
    context.fillRect(px + size - 5, py + 3, 2, size - 7);
    context.fillRect(px + 3, py + size - 5, size - 6, 2);
    // Document label
    const labelW = size * .48, labelH = size * .42;
    const lx = px + (size - labelW) / 2, ly = py + size * .22;
    context.fillStyle = "#f0e8d7";
    context.fillRect(lx, ly, labelW, labelH);
    context.strokeStyle = "rgba(69,58,42,.55)";
    context.lineWidth = .7;
    context.strokeRect(lx + .5, ly + .5, labelW - 1, labelH - 1);
    context.fillStyle = "rgba(75,64,47,.8)";
    context.fillRect(lx + 3, ly + 4, Math.max(2, labelW - 6), 1.5);
    context.fillRect(lx + 3, ly + 8, Math.max(2, labelW - 9), 1.2);
    // Archive hand-hole on selected boxes
    if (size >= 24) {
      context.fillStyle = "rgba(22,28,32,.9)";
      context.beginPath();
      context.ellipse(px + size / 2, py + size * .83, size * .12, size * .045, 0, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = "rgba(255,255,255,.22)";
      context.stroke();
    }
    context.restore();
  }

  function drawBoard() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0b131c";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Fine grid
    ctx.strokeStyle = "rgba(145,169,186,.09)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath(); ctx.moveTo(x * CELL + .5, 0); ctx.lineTo(x * CELL + .5, ROWS * CELL); ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * CELL + .5); ctx.lineTo(COLS * CELL, y * CELL + .5); ctx.stroke();
    }
    // Settled boxes
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (board[y][x]) drawBox(ctx, x, y, CELL, board[y][x].color, board[y][x].label);
      }
    }
    // Animação clássica: as linhas completas piscam antes de desaparecer.
    if (clearing && flashingRows.length) {
      const elapsed = performance.now() - clearStartedAt;
      const flashOn = Math.floor(elapsed / 90) % 2 === 0;
      flashingRows.forEach(y => {
        if (flashOn) {
          ctx.fillStyle = "#fff3c4";
          ctx.fillRect(0, y * CELL, canvas.width, CELL);
          ctx.fillStyle = "rgba(255,255,255,.72)";
          ctx.fillRect(0, y * CELL + 2, canvas.width, CELL - 4);
        } else {
          ctx.fillStyle = "rgba(213,163,94,.15)";
          ctx.fillRect(0, y * CELL, canvas.width, CELL);
        }
      });
    }
    if (current && !clearing) {
      // Ghost placement
      const ghost = { ...current, y: current.y };
      while (!collides(ghost, 0, 1)) ghost.y++;
      current.shape.forEach((row, sy) => row.forEach((value, sx) => {
        if (!value) return;
        const gx = ghost.x + sx, gy = ghost.y + sy;
        if (gy >= 0) {
          ctx.fillStyle = "rgba(220,235,244,.10)";
          ctx.fillRect(gx * CELL + 4, gy * CELL + 4, CELL - 8, CELL - 8);
          ctx.strokeStyle = "rgba(220,235,244,.28)";
          ctx.strokeRect(gx * CELL + 4.5, gy * CELL + 4.5, CELL - 9, CELL - 9);
        }
      }));
      current.shape.forEach((row, sy) => row.forEach((value, sx) => {
        if (value && current.y + sy >= 0) drawBox(ctx, current.x + sx, current.y + sy, CELL, current.color, current.label);
      }));
    }
  }

  function drawNext() {
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    nextCtx.fillStyle = "#0c141c";
    nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
    nextCtx.strokeStyle = "rgba(145,169,186,.08)";
    for (let x = 0; x < nextCanvas.width; x += 30) {
      nextCtx.beginPath(); nextCtx.moveTo(x + .5, 0); nextCtx.lineTo(x + .5, nextCanvas.height); nextCtx.stroke();
    }
    for (let y = 0; y < nextCanvas.height; y += 30) {
      nextCtx.beginPath(); nextCtx.moveTo(0, y + .5); nextCtx.lineTo(nextCanvas.width, y + .5); nextCtx.stroke();
    }
    if (!next) return;
    const shape = next.shape, size = 30;
    const width = shape[0].length * size, height = shape.length * size;
    const ox = Math.floor((nextCanvas.width - width) / 2 / size);
    const oy = Math.floor((nextCanvas.height - height) / 2 / size);
    shape.forEach((row, y) => row.forEach((v, x) => { if (v) drawBox(nextCtx, ox + x, oy + y, size, next.color, next.label); }));
  }

  function collides(piece, dx, dy, shape = piece.shape) {
    for (let y = 0; y < shape.length; y++) {
      for (let x = 0; x < shape[y].length; x++) {
        if (!shape[y][x]) continue;
        const nx = piece.x + x + dx, ny = piece.y + y + dy;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && board[ny][nx]) return true;
      }
    }
    return false;
  }

  function rotate(shape) {
    return shape[0].map((_, i) => shape.map(row => row[i]).reverse());
  }

  function lockPiece() {
    current.shape.forEach((row, y) => row.forEach((value, x) => {
      if (!value) return;
      const by = current.y + y, bx = current.x + x;
      if (by < 0) { endGame(); return; }
      board[by][bx] = { color: current.color, label: current.label };
    }));
    if (gameOver) return;

    const fullRows = [];
    for (let y = 0; y < ROWS; y++) {
      if (board[y].every(Boolean)) fullRows.push(y);
    }

    if (fullRows.length) {
      // Mantém as linhas no tabuleiro durante o pisca-pisca, como no Tetris clássico.
      clearing = true;
      flashingRows = fullRows;
      clearStartedAt = performance.now();
      statusText.textContent = "ORGANIZANDO DOCUMENTOS...";
      return;
    }
    spawnNextPiece();
  }

  function finishLineClear() {
    const count = flashingRows.length;
    const rowsToRemove = new Set(flashingRows);
    board = board.filter((_, index) => !rowsToRemove.has(index));
    while (board.length < ROWS) board.unshift(Array(COLS).fill(null));

    // Pontuação clássica por quantidade de linhas, multiplicada pelo nível.
    const points = [0, 100, 300, 500, 800][count] || count * 250;
    score += points * level;
    lines += count;
    level = Math.floor(lines / 10) + 1;
    clearing = false;
    flashingRows = [];
    updateStats();
    statusText.textContent = count === 4
      ? "ACERVO TOTALMENTE ORGANIZADO!"
      : `${count} LINHA${count > 1 ? "S" : ""} ORGANIZADA${count > 1 ? "S" : ""}`;
    spawnNextPiece();
  }

  function spawnNextPiece() {
    current = next;
    current.x = Math.floor(COLS / 2) - Math.ceil(current.shape[0].length / 2);
    current.y = -1;
    next = randomPiece();
    drawNext();
    if (collides(current, 0, 0)) endGame();
  }

  function updateStats() {
    scoreEl.textContent = formatScore(score);
    linesEl.textContent = lines;
    levelEl.textContent = level;
    if (score > best) {
      best = score;
      localStorage.setItem("tetrisArquivoBest", String(best));
      bestEl.textContent = formatScore(best);
    }
  }

  function drop() {
    if (!current || !running || paused || gameOver || clearing) return;
    if (!collides(current, 0, 1)) current.y++;
    else lockPiece();
    drawBoard();
  }

  function hardDrop() {
    if (!running || paused || gameOver || clearing) return;
    let distance = 0;
    while (!collides(current, 0, 1)) { current.y++; distance++; }
    score += distance * 2;
    updateStats();
    lockPiece();
    drawBoard();
  }

  function move(dx) {
    if (!running || paused || gameOver || clearing) return;
    if (!collides(current, dx, 0)) current.x += dx;
    drawBoard();
  }

  function turn() {
    if (!running || paused || gameOver || clearing) return;
    const rotated = rotate(current.shape);
    for (const offset of [0, -1, 1, -2, 2]) {
      if (!collides(current, offset, 0, rotated)) {
        current.shape = rotated; current.x += offset; break;
      }
    }
    drawBoard();
  }

  function startGame() {
    board = emptyBoard(); score = 0; lines = 0; level = 1;
    clearing = false; flashingRows = [];
    current = randomPiece(); next = randomPiece();
    current.y = -1;
    running = true; paused = false; gameOver = false; dropCounter = 0;
    updateStats(); drawNext(); drawBoard();
    overlay.classList.add("hidden");
    statusText.textContent = "ARQUIVO EM ORGANIZAÇÃO";
    if (animationId) cancelAnimationFrame(animationId);
    lastTime = 0;
    animationId = requestAnimationFrame(update);
  }

  function endGame() {
    running = false; gameOver = true;
    statusText.textContent = "SESSÃO ENCERRADA";
    overlayTitle.textContent = "Arquivo cheio!";
    overlayMessage.textContent = `Você organizou ${lines} linha(s) e marcou ${score} pontos. Tente uma nova organização.`;
    startBtn.textContent = "JOGAR NOVAMENTE  →";
    overlay.classList.remove("hidden");
    window.dispatchEvent(new CustomEvent("tetris:gameover", {
      detail: { score, lines, level, best }
    }));
  }

  function togglePause() {
    if (!running || gameOver) return;
    paused = !paused;
    if (paused) {
      overlayTitle.textContent = "Jogo pausado";
      overlayMessage.textContent = "O acervo está em pausa. Retome quando estiver pronto.";
      startBtn.textContent = "CONTINUAR  →";
      overlay.classList.remove("hidden");
      statusText.textContent = "PAUSADO";
    } else {
      overlay.classList.add("hidden");
      statusText.textContent = "ARQUIVO EM ORGANIZAÇÃO";
      lastTime = 0;
      animationId = requestAnimationFrame(update);
    }
  }

  function update(time = 0) {
    if (!running || paused || gameOver) return;
    const delta = lastTime ? time - lastTime : 0;
    lastTime = time;

    if (clearing) {
      drawBoard();
      if (time - clearStartedAt >= CLEAR_FLASH_DURATION) finishLineClear();
    } else {
      dropCounter += delta;
      const interval = Math.max(90, 780 - (level - 1) * 65);
      if (dropCounter > interval) { drop(); dropCounter = 0; }
      drawBoard();
    }
    animationId = requestAnimationFrame(update);
  }

  document.addEventListener("keydown", e => {
    const keys = ["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", " ", "p", "P"];
    if (keys.includes(e.key)) e.preventDefault();
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") move(-1);
    else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") move(1);
    else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") drop();
    else if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") turn();
    else if (e.key === " ") hardDrop();
    else if (e.key === "p" || e.key === "P" || e.key === "Escape") togglePause();
    else if ((e.key === "Enter") && !running) startGame();
  });

  // Controles touch com repetição ao manter pressionado, como em um joystick de minigame.
  const touchControls = document.querySelector(".touch-controls");
  if (touchControls) {
    let holdDelay = null;
    let holdRepeat = null;
    let activePointer = null;
    const stopHold = () => {
      if (holdDelay) clearTimeout(holdDelay);
      if (holdRepeat) clearInterval(holdRepeat);
      holdDelay = null;
      holdRepeat = null;
      activePointer = null;
      touchControls.querySelectorAll(".is-pressed").forEach(button => button.classList.remove("is-pressed"));
    };
    touchControls.querySelectorAll("[data-action]").forEach(button => {
      const action = button.dataset.action;
      const perform = () => {
        if (action === "left") move(-1);
        else if (action === "right") move(1);
        else if (action === "down") drop();
        else if (action === "rotate") turn();
        else if (action === "drop") hardDrop();
        else if (action === "pause") togglePause();
      };
      button.addEventListener("contextmenu", event => event.preventDefault());
      button.addEventListener("pointerdown", event => {
        event.preventDefault();
        if (action === "pause" || action === "drop") {
          perform();
          button.classList.add("is-pressed");
          setTimeout(() => button.classList.remove("is-pressed"), 130);
          return;
        }
        stopHold();
        activePointer = event.pointerId;
        button.classList.add("is-pressed");
        try { button.setPointerCapture(event.pointerId); } catch (_) {}
        perform();
        holdDelay = setTimeout(() => {
          holdRepeat = setInterval(perform, action === "down" ? 75 : 105);
        }, 170);
      });
      button.addEventListener("pointerup", event => {
        if (activePointer === event.pointerId) stopHold();
        button.classList.remove("is-pressed");
      });
      button.addEventListener("pointercancel", stopHold);
      button.addEventListener("lostpointercapture", stopHold);
    });
    window.addEventListener("blur", stopHold);
  }

  startBtn.addEventListener("click", () => {
    if (running && paused && !gameOver) {
      paused = false; overlay.classList.add("hidden"); statusText.textContent = "ARQUIVO EM ORGANIZAÇÃO";
      lastTime = 0; animationId = requestAnimationFrame(update);
    } else startGame();
  });

  // Initial static preview
  board = emptyBoard(); current = null; next = randomPiece();
  drawNext(); drawBoard();
})();
