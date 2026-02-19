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

    // ============ Solver ============
    function startSolve() {
        if (state.solving || !state.startPos) return;

        state.solving = true;
        state.solved = false;
        state.path = [];

        // Disable interactions
        $$('.cell').forEach(c => c.classList.add('disabled'));
        btnSolve.disabled = true;
        btnCreate.disabled = true;

        // Clear previous path visuals
        clearPathVisuals();
        clearPathSvg();

        setStatus('solving', '⏳', 'Đang tìm đường đi...');

        // Run solver in next tick to allow UI update
        setTimeout(() => {
            const t0 = performance.now();
            const solution = solve();
            const elapsed = Math.round(performance.now() - t0);

            if (solution) {
                state.path = solution;
                setStatus('solving', '✨', `Tìm thấy lời giải! Đang vẽ animation... (${elapsed}ms)`);
                animatePath(solution, elapsed);
            } else {
                state.solving = false;
                setStatus('error', '❌', 'Không tìm thấy đường đi! Thử thay đổi bản đồ hoặc vị trí bắt đầu.');
                $$('.cell:not(.obstacle)').forEach(c => {
                    c.classList.add('no-solution');
                    setTimeout(() => c.classList.remove('no-solution'), 600);
                });
                enableInteractions();
            }
        }, 50);
    }

    function solve() {
        const { rows, cols, grid, startPos } = state;

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
        const directions = [
            [-1, 0], [1, 0], [0, -1], [0, 1]  // up, down, left, right
        ];

        function countMoves(r, c) {
            let count = 0;
            for (const [dr, dc] of directions) {
                const nr = r + dr;
                const nc = c + dc;
                if (nr >= 0 && nr < rows && nc >= 0 && nc < cols &&
                    !visited[nr][nc] && grid[nr][nc] === 0) {
                    count++;
                }
            }
            return count;
        }

        function backtrack() {
            if (path.length === totalWalkable) return true;

            const { r, c } = path[path.length - 1];

            // Warnsdorff: sort neighbors by number of onward moves (ascending)
            const neighbors = [];
            for (const [dr, dc] of directions) {
                const nr = r + dr;
                const nc = c + dc;
                if (nr >= 0 && nr < rows && nc >= 0 && nc < cols &&
                    !visited[nr][nc] && grid[nr][nc] === 0) {
                    neighbors.push({ r: nr, c: nc, deg: countMoves(nr, nc) });
                }
            }

            // Sort by degree (Warnsdorff heuristic)
            neighbors.sort((a, b) => a.deg - b.deg);

            for (const next of neighbors) {
                visited[next.r][next.c] = true;
                path.push({ r: next.r, c: next.c });

                if (backtrack()) return true;

                path.pop();
                visited[next.r][next.c] = false;
            }

            return false;
        }

        if (backtrack()) {
            return [...path];
        }
        return null;
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
