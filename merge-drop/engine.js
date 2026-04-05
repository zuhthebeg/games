(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MergeDropEngine = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ROWS = 7;
  const COLS = 5;
  const TARGET_LEVEL = 6;
  const VISIBLE_QUEUE = 4;
  const DEFAULT_SEED = 20250406;
  const OPENING_QUEUE = [0, 0, 1, 0, 1, 2, 0, 1, 0, 2, 1, 0];
  const SCORE_TABLE = [0, 24, 72, 180, 420, 920, 1800, 3200];

  const TIERS = [
    { key: 'sprout', label: 'Sprout', accent: '#74d99f', glow: 'rgba(116, 217, 159, 0.32)' },
    { key: 'bloom', label: 'Bloom', accent: '#9de37a', glow: 'rgba(157, 227, 122, 0.32)' },
    { key: 'petal', label: 'Petal', accent: '#ffd166', glow: 'rgba(255, 209, 102, 0.34)' },
    { key: 'flare', label: 'Flare', accent: '#ff9f68', glow: 'rgba(255, 159, 104, 0.34)' },
    { key: 'nova', label: 'Nova', accent: '#ff6b6b', glow: 'rgba(255, 107, 107, 0.34)' },
    { key: 'aurora', label: 'Aurora', accent: '#5ad1e8', glow: 'rgba(90, 209, 232, 0.34)' },
    { key: 'crown', label: 'Crown', accent: '#f7f1a2', glow: 'rgba(247, 241, 162, 0.38)' },
    { key: 'zenith', label: 'Zenith', accent: '#d7c0ff', glow: 'rgba(215, 192, 255, 0.36)' },
  ];

  function createEmptyBoard(rows, cols) {
    return Array.from({ length: rows }, () => Array(cols).fill(null));
  }

  function cloneBoard(board) {
    return board.map((row) => row.slice());
  }

  function cloneState(state) {
    return {
      ...state,
      board: cloneBoard(state.board),
      queue: state.queue.slice(),
      openingQueue: state.openingQueue.slice(),
      availableColumns: state.availableColumns.slice(),
      lastAction: {
        ...state.lastAction,
        merges: (state.lastAction.merges || []).map((merge) => ({
          ...merge,
          anchor: { ...merge.anchor },
        })),
      },
    };
  }

  function nextRng(state) {
    return (Math.imul(state, 1664525) + 1013904223) >>> 0;
  }

  function scoreForMerge(createdLevel, size, chain) {
    const scoreIndex = Math.min(createdLevel, SCORE_TABLE.length - 1);
    return SCORE_TABLE[scoreIndex] * size * chain;
  }

  function sampleSpawnLevel(rngState, highestLevel) {
    const roll = rngState % 100;
    const cap = Math.min(3, Math.max(1, highestLevel));

    if (cap === 1) {
      return roll < 72 ? 0 : 1;
    }
    if (cap === 2) {
      if (roll < 56) return 0;
      if (roll < 86) return 1;
      return 2;
    }
    if (roll < 44) return 0;
    if (roll < 74) return 1;
    if (roll < 92) return 2;
    return 3;
  }

  function getHighestLevel(board) {
    let highest = 0;
    for (let row = 0; row < board.length; row += 1) {
      for (let col = 0; col < board[row].length; col += 1) {
        highest = Math.max(highest, board[row][col] == null ? 0 : board[row][col]);
      }
    }
    return highest;
  }

  function getAvailableColumns(board) {
    const available = [];
    for (let col = 0; col < board[0].length; col += 1) {
      if (board[0][col] == null) available.push(col);
    }
    return available;
  }

  function findDropRow(board, col) {
    for (let row = board.length - 1; row >= 0; row -= 1) {
      if (board[row][col] == null) return row;
    }
    return -1;
  }

  function collectCluster(board, startRow, startCol) {
    const level = board[startRow][startCol];
    if (level == null) return [];

    const queue = [{ row: startRow, col: startCol }];
    const cluster = [];
    const localSeen = new Set();

    while (queue.length) {
      const current = queue.pop();
      const key = `${current.row}:${current.col}`;
      if (localSeen.has(key)) continue;
      localSeen.add(key);
      if (board[current.row][current.col] !== level) continue;

      cluster.push(current);
      if (current.row > 0) queue.push({ row: current.row - 1, col: current.col });
      if (current.row < board.length - 1) queue.push({ row: current.row + 1, col: current.col });
      if (current.col > 0) queue.push({ row: current.row, col: current.col - 1 });
      if (current.col < board[0].length - 1) queue.push({ row: current.row, col: current.col + 1 });
    }

    return cluster;
  }

  function chooseAnchor(cluster) {
    return cluster
      .slice()
      .sort((a, b) => {
        if (b.row !== a.row) return b.row - a.row;
        return a.col - b.col;
      })[0];
  }

  function applyGravity(board) {
    const rows = board.length;
    const cols = board[0].length;

    for (let col = 0; col < cols; col += 1) {
      const values = [];
      for (let row = rows - 1; row >= 0; row -= 1) {
        if (board[row][col] != null) values.push(board[row][col]);
      }
      for (let row = rows - 1; row >= 0; row -= 1) {
        board[row][col] = values[rows - 1 - row] == null ? null : values[rows - 1 - row];
      }
    }

    return board;
  }

  function findResolvableCluster(board, preferredAnchor) {
    if (preferredAnchor) {
      const { row, col } = preferredAnchor;
      if (board[row] && board[row][col] != null) {
        const preferredCluster = collectCluster(board, row, col);
        if (preferredCluster.length >= 3) {
          return {
            cells: preferredCluster,
            level: board[row][col],
          };
        }
      }
    }

    const seen = new Set();
    for (let row = board.length - 1; row >= 0; row -= 1) {
      for (let col = 0; col < board[row].length; col += 1) {
        const key = `${row}:${col}`;
        if (seen.has(key) || board[row][col] == null) continue;
        const cluster = collectCluster(board, row, col);
        cluster.forEach((cell) => {
          seen.add(`${cell.row}:${cell.col}`);
        });
        if (cluster.length >= 3) {
          return {
            cells: cluster,
            level: board[row][col],
          };
        }
      }
    }

    return null;
  }

  function resolveBoard(board, preferredAnchor) {
    const merges = [];
    let chain = 0;
    let nextAnchor = preferredAnchor || null;

    while (true) {
      const cluster = findResolvableCluster(board, nextAnchor);
      if (!cluster) break;

      chain += 1;
      const anchor = chooseAnchor(cluster.cells);
      const createdLevel = Math.min(cluster.level + 1, TIERS.length - 1);

      cluster.cells.forEach((cell) => {
        board[cell.row][cell.col] = null;
      });
      board[anchor.row][anchor.col] = createdLevel;

      merges.push({
        chain,
        size: cluster.cells.length,
        fromLevel: cluster.level,
        createdLevel,
        anchor: { row: anchor.row, col: anchor.col },
        score: scoreForMerge(createdLevel, cluster.cells.length, chain),
      });

      applyGravity(board);
      nextAnchor = anchor;
    }

    return { merges, chain };
  }

  function drawSpawn(state) {
    if (state.openingIndex < state.openingQueue.length) {
      return {
        level: state.openingQueue[state.openingIndex],
        openingIndex: state.openingIndex + 1,
        rngState: state.rngState,
      };
    }

    const nextState = nextRng(state.rngState);
    return {
      level: sampleSpawnLevel(nextState, state.highestLevel),
      openingIndex: state.openingIndex,
      rngState: nextState,
    };
  }

  function refillQueue(state) {
    while (state.queue.length < state.visibleQueue) {
      const spawn = drawSpawn(state);
      state.queue.push(spawn.level);
      state.openingIndex = spawn.openingIndex;
      state.rngState = spawn.rngState;
    }
    return state;
  }

  function buildBaseState(options) {
    const rows = options.rows || ROWS;
    const cols = options.cols || COLS;
    const targetLevel = options.targetLevel == null ? TARGET_LEVEL : options.targetLevel;
    const visibleQueue = options.visibleQueue || VISIBLE_QUEUE;
    const openingQueue = (options.openingQueue || OPENING_QUEUE).slice();
    const seed = options.seed == null ? DEFAULT_SEED : options.seed;
    const board = options.board ? cloneBoard(options.board) : createEmptyBoard(rows, cols);
    const highestLevel = options.highestLevel == null ? getHighestLevel(board) : options.highestLevel;

    return {
      rows,
      cols,
      targetLevel,
      visibleQueue,
      openingQueue,
      openingIndex: options.openingIndex || 0,
      seed,
      rngState: options.rngState == null ? seed : options.rngState,
      board,
      queue: (options.queue || []).slice(),
      turn: options.turn || 0,
      score: options.score || 0,
      bestChain: options.bestChain || 0,
      highestLevel,
      status: options.status || 'ready',
      availableColumns: getAvailableColumns(board),
      lastAction: options.lastAction || { valid: true, type: 'ready', reason: 'ready', merges: [] },
    };
  }

  function createGameState(options) {
    const state = buildBaseState(options || {});
    refillQueue(state);
    state.availableColumns = getAvailableColumns(state.board);
    if (state.highestLevel >= state.targetLevel) {
      state.status = 'won';
    } else if (state.availableColumns.length === 0) {
      state.status = 'game-over';
    }
    return state;
  }

  function invalid(state, reason, patch) {
    const next = cloneState(state);
    next.lastAction = {
      valid: false,
      type: 'blocked',
      reason,
      merges: [],
      ...(patch || {}),
    };
    return next;
  }

  function dropPiece(state, col) {
    if (col < 0 || col >= state.cols) {
      return invalid(state, 'missing-column', { col });
    }
    if (state.status === 'won') {
      return invalid(state, 'already-won', { col });
    }
    if (state.status === 'game-over') {
      return invalid(state, 'game-over', { col });
    }

    const dropRow = findDropRow(state.board, col);
    if (dropRow === -1) {
      return invalid(state, 'column-full', { col });
    }

    const next = cloneState(state);
    const piece = next.queue.shift();
    next.board[dropRow][col] = piece;
    next.turn += 1;

    refillQueue(next);

    const resolution = resolveBoard(next.board, { row: dropRow, col });
    const mergeScore = resolution.merges.reduce((sum, merge) => sum + merge.score, 0);

    next.score += mergeScore;
    next.bestChain = Math.max(next.bestChain, resolution.chain);
    next.highestLevel = getHighestLevel(next.board);
    next.availableColumns = getAvailableColumns(next.board);

    if (next.highestLevel >= next.targetLevel) {
      next.status = 'won';
    } else if (next.availableColumns.length === 0) {
      next.status = 'game-over';
    } else {
      next.status = 'playing';
    }

    next.lastAction = {
      valid: true,
      type: 'drop',
      reason: resolution.merges.length ? (next.status === 'won' ? 'target-reached' : 'merged') : 'dropped',
      col,
      row: dropRow,
      level: piece,
      scoreGained: mergeScore,
      merges: resolution.merges,
      status: next.status,
    };

    return next;
  }

  function restartGame(state, overrides) {
    return createGameState({
      rows: state.rows,
      cols: state.cols,
      targetLevel: state.targetLevel,
      visibleQueue: state.visibleQueue,
      openingQueue: state.openingQueue.slice(),
      seed: overrides && overrides.seed != null ? overrides.seed : state.seed,
    });
  }

  function serializeForDebug(state) {
    return JSON.stringify({
      rows: state.rows,
      cols: state.cols,
      targetLevel: state.targetLevel,
      status: state.status,
      turn: state.turn,
      score: state.score,
      bestChain: state.bestChain,
      highestLevel: state.highestLevel,
      seed: state.seed,
      rngState: state.rngState,
      openingIndex: state.openingIndex,
      openingRemaining: state.openingQueue.slice(state.openingIndex),
      queue: state.queue,
      availableColumns: state.availableColumns,
      board: state.board,
      lastAction: state.lastAction,
    }, null, 2);
  }

  return {
    ROWS,
    COLS,
    TARGET_LEVEL,
    VISIBLE_QUEUE,
    DEFAULT_SEED,
    OPENING_QUEUE: OPENING_QUEUE.slice(),
    TIERS,
    createGameState,
    dropPiece,
    restartGame,
    serializeForDebug,
    getAvailableColumns,
    findDropRow,
  };
});
