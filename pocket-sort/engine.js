(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./levels.js'));
  } else {
    root.PocketSortEngine = factory(root.PocketSortLevels);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (levelsModule) {
  const LEVELS = levelsModule.LEVELS;

  function clonePockets(pockets) {
    return pockets.map((pocket) => pocket.slice());
  }

  function getCapacity(level) {
    return level.capacity || Math.max(2, ...level.pockets.map((pocket) => pocket.length));
  }

  function isUniform(pocket) {
    return pocket.length > 0 && pocket.every((item) => item === pocket[0]);
  }

  function getLockedSet(pockets, capacity) {
    const locked = new Set();
    pockets.forEach((pocket, index) => {
      if (pocket.length === capacity && isUniform(pocket)) {
        locked.add(index);
      }
    });
    return locked;
  }

  function isCleared(pockets, capacity) {
    return pockets.every((pocket) => pocket.length === 0 || (pocket.length === capacity && isUniform(pocket)));
  }

  function createGameState(levelList = LEVELS, levelIndex = 0) {
    const level = levelList[levelIndex];
    const capacity = getCapacity(level);
    const pockets = clonePockets(level.pockets);
    const locked = getLockedSet(pockets, capacity);
    return {
      levels: levelList,
      levelIndex,
      level,
      capacity,
      pockets,
      locked,
      selectedPocket: null,
      moveCount: 0,
      lastMove: { valid: true, reason: 'ready', from: null, to: null, item: null },
      isCleared: isCleared(pockets, capacity),
      showClear: isCleared(pockets, capacity),
      lockedCount: locked.size,
    };
  }

  function withDerived(state, patch) {
    const next = { ...state, ...patch };
    next.locked = getLockedSet(next.pockets, next.capacity);
    next.lockedCount = next.locked.size;
    next.isCleared = isCleared(next.pockets, next.capacity);
    next.showClear = next.isCleared;
    return next;
  }

  function invalidMove(state, reason, from, to) {
    return withDerived(state, {
      lastMove: { valid: false, reason, from, to, item: null },
      selectedPocket: from,
    });
  }

  function selectPocket(state, pocketIndex) {
    const pockets = clonePockets(state.pockets);
    const pocket = pockets[pocketIndex];
    if (!pocket) {
      return invalidMove(state, 'missing-pocket', state.selectedPocket, pocketIndex);
    }

    if (state.selectedPocket === null) {
      if (pocket.length === 0) {
        return invalidMove(state, 'empty-pocket', null, pocketIndex);
      }
      if (state.locked.has(pocketIndex)) {
        return invalidMove(state, 'locked-pocket', null, pocketIndex);
      }
      return withDerived(state, {
        selectedPocket: pocketIndex,
        lastMove: { valid: true, reason: 'selected', from: pocketIndex, to: null, item: pocket[pocket.length - 1] },
      });
    }

    const fromIndex = state.selectedPocket;
    if (fromIndex === pocketIndex) {
      return withDerived(state, {
        selectedPocket: null,
        lastMove: { valid: true, reason: 'deselected', from: fromIndex, to: pocketIndex, item: null },
      });
    }

    if (state.locked.has(fromIndex)) {
      return invalidMove(state, 'locked-pocket', fromIndex, pocketIndex);
    }

    const fromPocket = pockets[fromIndex];
    const toPocket = pockets[pocketIndex];
    const item = fromPocket[fromPocket.length - 1];

    if (!item) {
      return invalidMove(state, 'empty-pocket', fromIndex, pocketIndex);
    }
    if (state.locked.has(pocketIndex)) {
      return invalidMove(state, 'locked-pocket', fromIndex, pocketIndex);
    }
    if (toPocket.length >= state.capacity) {
      return invalidMove(state, 'pocket-full', fromIndex, pocketIndex);
    }
    if (toPocket.length > 0 && toPocket[toPocket.length - 1] !== item) {
      return invalidMove(state, 'color-mismatch', fromIndex, pocketIndex);
    }

    fromPocket.pop();
    toPocket.push(item);

    return withDerived(state, {
      pockets,
      selectedPocket: null,
      moveCount: state.moveCount + 1,
      lastMove: { valid: true, reason: 'moved', from: fromIndex, to: pocketIndex, item },
    });
  }

  function restartLevel(state) {
    return createGameState(state.levels, state.levelIndex);
  }

  function nextLevel(state) {
    const nextIndex = (state.levelIndex + 1) % state.levels.length;
    return createGameState(state.levels, nextIndex);
  }

  function serializeForDebug(state) {
    return JSON.stringify({
      level: state.levelIndex + 1,
      capacity: state.capacity,
      board: state.pockets,
      selectedPocket: state.selectedPocket,
      moveCount: state.moveCount,
      lockedPockets: Array.from(state.locked),
      lockedCount: state.lockedCount,
      isCleared: state.isCleared,
      lastMove: state.lastMove,
    }, null, 2);
  }

  return {
    LEVELS,
    createGameState,
    selectPocket,
    restartLevel,
    nextLevel,
    serializeForDebug,
  };
});
