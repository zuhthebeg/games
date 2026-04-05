(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./levels.js'));
  } else {
    root.PocketSortEngine = factory(root.PocketSortLevels);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (levelsModule) {
  const LEVELS = levelsModule.LEVELS;

  function buildBins(level) {
    return level.bins.map((type) => ({
      type,
      items: [],
      targetCount: level.tray.filter((item) => item === type).length,
    }));
  }

  function isCleared(bins, tray) {
    return tray.length === 0 && bins.every((bin) => bin.items.length === bin.targetCount);
  }

  function cloneStateShape(state) {
    return {
      ...state,
      tray: state.tray.slice(),
      bins: state.bins.map((bin) => ({ ...bin, items: bin.items.slice() })),
    };
  }

  function createGameState(levelList = LEVELS, levelIndex = 0) {
    const level = levelList[levelIndex];
    const bins = buildBins(level);
    const tray = level.tray.slice();
    return {
      levels: levelList,
      levelIndex,
      level,
      bins,
      tray,
      selectedItemIndex: null,
      selectedItem: null,
      moveCount: 0,
      lastAction: { valid: true, reason: 'ready', item: null, bin: null },
      isCleared: isCleared(bins, tray),
      showClear: isCleared(bins, tray),
    };
  }

  function withState(state, patch) {
    const next = { ...state, ...patch };
    next.isCleared = isCleared(next.bins, next.tray);
    next.showClear = next.isCleared;
    return next;
  }

  function invalid(state, reason, item = null, bin = null) {
    return withState(state, {
      lastAction: { valid: false, reason, item, bin },
    });
  }

  function selectItem(state, itemIndex) {
    if (itemIndex < 0 || itemIndex >= state.tray.length) {
      return invalid(state, 'missing-item');
    }
    if (state.selectedItemIndex === itemIndex) {
      return withState(state, {
        selectedItemIndex: null,
        selectedItem: null,
        lastAction: { valid: true, reason: 'deselected', item: null, bin: null },
      });
    }
    return withState(state, {
      selectedItemIndex: itemIndex,
      selectedItem: state.tray[itemIndex],
      lastAction: { valid: true, reason: 'selected', item: state.tray[itemIndex], bin: null },
    });
  }

  function placeSelectedIntoBin(state, binIndex) {
    if (state.selectedItemIndex === null || state.selectedItem === null) {
      return invalid(state, 'no-item-selected');
    }
    if (binIndex < 0 || binIndex >= state.bins.length) {
      return invalid(state, 'missing-bin', state.selectedItem, null);
    }

    const next = cloneStateShape(state);
    const bin = next.bins[binIndex];
    const item = next.selectedItem;

    if (bin.type !== item) {
      return invalid(state, 'wrong-bin', item, binIndex);
    }
    if (bin.items.length >= bin.targetCount) {
      return invalid(state, 'bin-full', item, binIndex);
    }

    next.tray.splice(next.selectedItemIndex, 1);
    bin.items.push(item);

    return withState(next, {
      selectedItemIndex: null,
      selectedItem: null,
      moveCount: next.moveCount + 1,
      lastAction: { valid: true, reason: 'placed', item, bin: binIndex },
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
      tray: state.tray,
      bins: state.bins.map((bin) => ({
        type: bin.type,
        items: bin.items,
        targetCount: bin.targetCount,
      })),
      selectedItemIndex: state.selectedItemIndex,
      selectedItem: state.selectedItem,
      moveCount: state.moveCount,
      isCleared: state.isCleared,
      lastAction: state.lastAction,
    }, null, 2);
  }

  return {
    LEVELS,
    createGameState,
    selectItem,
    placeSelectedIntoBin,
    restartLevel,
    nextLevel,
    serializeForDebug,
  };
});
