/**
 * ONE-LINE PUZZLE SOLVER
 * Tìm đường đi Hamiltonian trên lưới NxM với obstacles
 * Thuật toán: Backtracking + Warnsdorff's heuristic
 */

(() => {
    'use strict';

    // ============ State ============
    const state = {
        rows: 5,
        cols: 5,
        grid: [],          // 2D array: 0 = walkable, 1 = obstacle
        startPos: null,     // { r, c }
        editMode: 'obstacle', // 'obstacle' | 'start'
        solving: false,
        solved: false,
        solverCancelled: false,
        solverTimer: null,
        path: [],           // [{ r, c }, ...]
        animationTimer: null,
    };

    // ============ DOM refs ============
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const rowsInput = $('#rows');
    const colsInput = $('#cols');
    const btnCreate = $('#btn-create');
    const btnSolve = $('#btn-solve');
    const btnReset = $('#btn-reset');
    const speedSlider = $('#speed');
    const speedValue = $('#speed-value');
    const gridContainer = $('#grid-container');
    const pathSvg = $('#path-svg');
    const statusBox = $('#status-box');
    const statsSection = $('#stats-section');
    const statCells = $('#stat-cells');
    const statTime = $('#stat-time');

    // ============ Init ============
    function init() {
        btnCreate.addEventListener('click', createGrid);
        btnSolve.addEventListener('click', startSolve);
        btnReset.addEventListener('click', resetGrid);

        // Step buttons
        $$('.btn-step').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = $(` #${btn.dataset.target}`);
                const step = parseInt(btn.dataset.step);
                let val = parseInt(target.value) + step;
                val = Math.max(parseInt(target.min), Math.min(parseInt(target.max), val));
                target.value = val;
            });
        });

        // Mode selector
        $$('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('.mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.editMode = btn.dataset.mode;
            });
        });

        // Speed slider
        speedSlider.addEventListener('input', () => {
            speedValue.textContent = `${speedSlider.value}ms`;
        });

        // Create initial grid
        createGrid();
    }

    // ============ Grid Creation ============
    function createGrid() {
        if (state.solving) return;

        state.rows = parseInt(rowsInput.value);
        state.cols = parseInt(colsInput.value);
        state.grid = Array.from({ length: state.rows }, () =>
            Array.from({ length: state.cols }, () => 0)
        );
        state.startPos = null;
        state.path = [];
        state.solved = false;

        renderGrid();
        clearPathSvg();
        updateSolveButton();
        setStatus('info', '💡', 'Click vào ô để đặt <strong>chướng ngại vật</strong> hoặc chọn <strong>điểm bắt đầu</strong>. Chuyển chế độ ở panel bên trái.');
        statsSection.style.display = 'none';
    }

    function renderGrid() {
        // Calculate cell size based on available space
        const maxGridWidth = gridContainer.parentElement.clientWidth - 64;
        const maxGridHeight = window.innerHeight - 200;
        let cellSize = Math.min(
            Math.floor(maxGridWidth / state.cols) - 4,
            Math.floor(maxGridHeight / state.rows) - 4,
            56
        );
        cellSize = Math.max(cellSize, 30);

        gridContainer.style.gridTemplateColumns = `repeat(${state.cols}, ${cellSize}px)`;
        gridContainer.style.gridTemplateRows = `repeat(${state.rows}, ${cellSize}px)`;
        gridContainer.innerHTML = '';

        for (let r = 0; r < state.rows; r++) {
            for (let c = 0; c < state.cols; c++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.row = r;
                cell.dataset.col = c;
                cell.style.width = `${cellSize}px`;
                cell.style.height = `${cellSize}px`;

                cell.addEventListener('click', () => handleCellClick(r, c));

                // Apply saved state
                if (state.grid[r][c] === 1) {
                    cell.classList.add('obstacle');
                }
                if (state.startPos && state.startPos.r === r && state.startPos.c === c) {
                    cell.classList.add('start');
                }

                gridContainer.appendChild(cell);
            }
        }
    }

    function handleCellClick(r, c) {
        if (state.solving || state.solved) return;

        const cell = getCell(r, c);
        if (!cell) return;

        if (state.editMode === 'obstacle') {
            // Toggle obstacle
            if (state.startPos && state.startPos.r === r && state.startPos.c === c) {
                // Can't place obstacle on start
                return;
            }
            if (state.grid[r][c] === 1) {
                state.grid[r][c] = 0;
                cell.classList.remove('obstacle');
            } else {
                state.grid[r][c] = 1;
                cell.classList.add('obstacle');
            }
        } else if (state.editMode === 'start') {
            // Set start position
            if (state.grid[r][c] === 1) return; // Can't start on obstacle

            // Remove old start
            if (state.startPos) {
                const oldCell = getCell(state.startPos.r, state.startPos.c);
                if (oldCell) oldCell.classList.remove('start');
            }

            state.startPos = { r, c };
            cell.classList.add('start');
        }

        updateSolveButton();
    }

    function getCell(r, c) {
        return gridContainer.querySelector(`[data-row="${r}"][data-col="${c}"]`);
    }

    // ============ Solver (Async Chunked) ============
    function startSolve() {
        if (state.solving || !state.startPos) return;

        state.solving = true;
        state.solved = false;
        state.solverCancelled = false;
        state.path = [];

        // Disable interactions
        $$('.cell').forEach(c => c.classList.add('disabled'));
        btnSolve.disabled = true;
        btnCreate.disabled = true;

        // Clear previous path visuals
        clearPathVisuals();
        clearPathSvg();

        setStatus('solving', '⏳', 'Đang tìm đường đi... (nhấn <strong>Reset</strong> để hủy)');

        // Start async solver
        const t0 = performance.now();
        solveAsync((result, reason) => {
            const elapsed = Math.round(performance.now() - t0);

            if (reason === 'solved' && result) {
                state.path = result;
                setStatus('solving', '✨', `Tìm thấy lời giải! Đang vẽ animation... (${elapsed}ms)`);
                animatePath(result, elapsed);
            } else if (reason === 'cancelled') {
                state.solving = false;
                setStatus('info', '🛑', 'Đã hủy tìm đường. Bạn có thể chỉnh bản đồ và thử lại.');
                enableInteractions();
            } else {
                state.solving = false;
                setStatus('error', '❌', 'Không tìm thấy đường đi! Thử thay đổi bản đồ hoặc vị trí bắt đầu.');
                $$('.cell:not(.obstacle)').forEach(c => {
                    c.classList.add('no-solution');
                    setTimeout(() => c.classList.remove('no-solution'), 600);
                });
                enableInteractions();
            }
        });
    }

    function solveAsync(callback) {
        const { rows, cols, grid, startPos } = state;
        const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];

        // Count walkable cells
        let totalWalkable = 0;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (grid[r][c] === 0) totalWalkable++;
            }
        }

        // Visited array
        const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
        visited[startPos.r][startPos.c] = true;

        const path = [{ r: startPos.r, c: startPos.c }];

        // Helper: check if cell is valid unvisited walkable
        function isOpen(r, c) {
            return r >= 0 && r < rows && c >= 0 && c < cols &&
                !visited[r][c] && grid[r][c] === 0;
        }

        function countMoves(r, c) {
            let count = 0;
            for (const [dr, dc] of directions) {
                if (isOpen(r + dr, c + dc)) count++;
            }
            return count;
        }

        // ---- PRUNING: Connectivity check via flood fill ----
        // After visiting a cell, check if remaining unvisited cells are still connected.
        // If they split into >1 group, this branch is a dead end → prune.
        const floodVisited = Array.from({ length: rows }, () => Array(cols).fill(false));

        function countConnected(sr, sc) {
            // BFS flood fill from (sr,sc) among unvisited walkable cells
            let count = 0;
            const queue = [[sr, sc]];
            floodVisited[sr][sc] = true;
            while (queue.length > 0) {
                const [cr, cc] = queue.pop();
                count++;
                for (const [dr, dc] of directions) {
                    const nr = cr + dr, nc = cc + dc;
                    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols &&
                        !floodVisited[nr][nc] && !visited[nr][nc] && grid[nr][nc] === 0) {
                        floodVisited[nr][nc] = true;
                        queue.push([nr, nc]);
                    }
                }
            }
            return count;
        }

        function isStillConnected() {
            const remaining = totalWalkable - path.length;
            if (remaining <= 1) return true; // 0 or 1 cell always "connected"

            // Reset flood visited
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    floodVisited[r][c] = false;
                }
            }

            // Find first unvisited walkable cell
            let startR = -1, startC = -1;
            outer:
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (!visited[r][c] && grid[r][c] === 0) {
                        startR = r; startC = c;
                        break outer;
                    }
                }
            }
            if (startR === -1) return true;

            const connected = countConnected(startR, startC);
            return connected === remaining;
        }

        // ---- PRUNING: Dead-end detection ----
        // If any unvisited cell has 0 neighbors → impossible (unless it's the only one left)
        // If an unvisited cell has exactly 1 neighbor and that cell is NOT adjacent to current pos
        // and there are still >1 remaining cells, it creates a forced dead-end
        function hasDeadEnd() {
            const remaining = totalWalkable - path.length;
            if (remaining <= 1) return false;

            const cur = path[path.length - 1];

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (visited[r][c] || grid[r][c] !== 0) continue;
                    const moves = countMoves(r, c);
                    if (moves === 0 && remaining > 1) return true;
                    // If cell has 1 move and is NOT adjacent to current → forced dead-end
                    // (it must be visited next, but we can't reach it next)
                    if (moves === 1 && remaining > 1) {
                        const isAdjacentToCurrent = Math.abs(r - cur.r) + Math.abs(c - cur.c) === 1;
                        if (!isAdjacentToCurrent) {
                            // Check: is there only one such forced cell? If 2+ forced cells exist,
                            // we can only visit one next → dead end
                            // Actually even 1 forced cell that's not adjacent is fine IF
                            // it can be reached later. But if it has just 1 exit, it must be
                            // approached from that exit, which constrains the path.
                            // For simplicity, only prune if 0-move cells exist.
                        }
                    }
                }
            }
            return false;
        }

        function getNeighborsSorted(r, c) {
            const neighbors = [];
            for (const [dr, dc] of directions) {
                const nr = r + dr, nc = c + dc;
                if (isOpen(nr, nc)) {
                    neighbors.push({ r: nr, c: nc, deg: countMoves(nr, nc) });
                }
            }
            neighbors.sort((a, b) => a.deg - b.deg);
            return neighbors;
        }

        // Iterative backtracking with explicit stack
        const stack = [];
        const initNeighbors = getNeighborsSorted(startPos.r, startPos.c);
        stack.push({ neighbors: initNeighbors, index: 0 });

        let totalSteps = 0;
        const CHUNK_SIZE = 10000;
        const startTime = performance.now();

        function processChunk() {
            if (state.solverCancelled) {
                callback(null, 'cancelled');
                return;
            }

            const chunkEnd = totalSteps + CHUNK_SIZE;

            while (totalSteps < chunkEnd) {
                totalSteps++;

                // Found solution?
                if (path.length === totalWalkable) {
                    callback([...path], 'solved');
                    return;
                }

                // Stack empty = exhausted
                if (stack.length === 0) {
                    callback(null, 'no_solution');
                    return;
                }

                const frame = stack[stack.length - 1];

                if (frame.index >= frame.neighbors.length) {
                    // Backtrack
                    stack.pop();
                    const removed = path.pop();
                    if (removed) visited[removed.r][removed.c] = false;
                    continue;
                }

                // Try next neighbor
                const next = frame.neighbors[frame.index];
                frame.index++;

                visited[next.r][next.c] = true;
                path.push({ r: next.r, c: next.c });

                // ---- PRUNING CHECK ----
                // Check dead-ends and connectivity BEFORE pushing neighbors
                if (hasDeadEnd() || !isStillConnected()) {
                    // This move leads to dead end, undo and try next neighbor
                    path.pop();
                    visited[next.r][next.c] = false;
                    continue;
                }

                // Push new frame
                const nextNeighbors = getNeighborsSorted(next.r, next.c);
                stack.push({ neighbors: nextNeighbors, index: 0 });
            }

            // Update status with progress
            const elapsed = Math.round(performance.now() - startTime);
            setStatus('solving', '⏳',
                `Đang tìm... <strong>${(totalSteps / 1000).toFixed(0)}k</strong> bước | ${(elapsed / 1000).toFixed(1)}s (nhấn <strong>Reset</strong> để hủy)`);

            // Yield to browser, then continue
            state.solverTimer = setTimeout(processChunk, 0);
        }

        // Start first chunk
        state.solverTimer = setTimeout(processChunk, 0);
    }

    // ============ Animation ============
    function animatePath(path, solveTime) {
        let step = 0;
        const delay = parseInt(speedSlider.value);

        function nextStep() {
            if (step >= path.length) {
                // Animation done
                state.solving = false;
                state.solved = true;

                // Mark last cell as end
                const lastPos = path[path.length - 1];
                const lastCell = getCell(lastPos.r, lastPos.c);
                if (lastCell) lastCell.classList.add('end-cell');

                // Remove 'current' from all
                $$('.cell.current').forEach(c => c.classList.remove('current'));

                setStatus('success', '🎉', `Hoàn thành! Đường đi bao phủ <strong>${path.length}</strong> ô.`);

                // Stats
                statsSection.style.display = '';
                statCells.textContent = path.length;
                statTime.textContent = solveTime;

                enableInteractions();
                return;
            }

            const pos = path[step];
            const cell = getCell(pos.r, pos.c);

            // Remove 'current' from prev
            if (step > 0) {
                const prevPos = path[step - 1];
                const prevCell = getCell(prevPos.r, prevPos.c);
                if (prevCell) prevCell.classList.remove('current');
            }

            if (cell) {
                cell.classList.add('visited', 'current');
                cell.textContent = step + 1;
                cell.style.color = 'rgba(167, 139, 250, 0.9)';
            }

            // Draw line from prev to current
            if (step > 0) {
                drawLine(path[step - 1], pos);
            }

            step++;
            state.animationTimer = setTimeout(nextStep, delay);
        }

        nextStep();
    }

    function drawLine(from, to) {
        const fromCell = getCell(from.r, from.c);
        const toCell = getCell(to.r, to.c);
        if (!fromCell || !toCell) return;

        const gridRect = gridContainer.parentElement.getBoundingClientRect();
        const svgRect = pathSvg.getBoundingClientRect();

        const fromRect = fromCell.getBoundingClientRect();
        const toRect = toCell.getBoundingClientRect();

        const x1 = fromRect.left + fromRect.width / 2 - svgRect.left;
        const y1 = fromRect.top + fromRect.height / 2 - svgRect.top;
        const x2 = toRect.left + toRect.width / 2 - svgRect.left;
        const y2 = toRect.top + toRect.height / 2 - svgRect.top;

        // Ensure gradient defs exist
        if (!pathSvg.querySelector('#pathGradient')) {
            const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
            grad.id = 'pathGradient';
            grad.setAttribute('gradientUnits', 'userSpaceOnUse');

            const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
            stop1.setAttribute('offset', '0%');
            stop1.setAttribute('stop-color', '#6366f1');
            const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
            stop2.setAttribute('offset', '100%');
            stop2.setAttribute('stop-color', '#a78bfa');

            grad.appendChild(stop1);
            grad.appendChild(stop2);
            defs.appendChild(grad);
            pathSvg.appendChild(defs);
        }

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        line.classList.add('path-line');
        pathSvg.appendChild(line);
    }

    function clearPathSvg() {
        pathSvg.innerHTML = '';
    }

    function clearPathVisuals() {
        $$('.cell').forEach(cell => {
            cell.classList.remove('visited', 'current', 'end-cell', 'no-solution');
            cell.textContent = '';
            cell.style.color = '';
        });
    }

    // ============ Reset ============
    function resetGrid() {
        // Cancel solver if running
        if (state.solverTimer) {
            clearTimeout(state.solverTimer);
            state.solverTimer = null;
        }
        state.solverCancelled = true;

        if (state.animationTimer) {
            clearTimeout(state.animationTimer);
            state.animationTimer = null;
        }
        state.solving = false;
        state.solved = false;
        state.path = [];

        clearPathVisuals();
        clearPathSvg();

        // Re-apply start marker
        if (state.startPos) {
            const startCell = getCell(state.startPos.r, state.startPos.c);
            if (startCell) startCell.classList.add('start');
        }

        enableInteractions();
        updateSolveButton();
        setStatus('info', '💡', 'Bản đồ đã được reset. Bạn có thể chỉnh sửa và giải lại.');
        statsSection.style.display = 'none';
    }

    // ============ Helpers ============
    function updateSolveButton() {
        btnSolve.disabled = !state.startPos || state.solving;
    }

    function enableInteractions() {
        $$('.cell').forEach(c => c.classList.remove('disabled'));
        btnSolve.disabled = !state.startPos;
        btnCreate.disabled = false;
    }

    function setStatus(type, icon, text) {
        statusBox.className = `status-box ${type}`;
        statusBox.querySelector('.status-icon').textContent = icon;
        statusBox.querySelector('.status-text').innerHTML = text;
    }

    // ============ Start ============
    init();
})();
