(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CatanAI = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DICE_WEIGHT = {
    2: 1, 3: 2, 4: 3, 5: 4,
    6: 5, 7: 0, 8: 5, 9: 4,
    10: 3, 11: 2, 12: 1
  };

  const RESOURCE_VALUE = {
    brick: 0.5,
    lumber: 0.6,
    wool: 0.45,
    grain: 0.9,
    ore: 1.1
  };

  function scoreVertex(state, vertexIdx) {
    const v = state.vertices[vertexIdx];
    if (!v) return -Infinity;
    let score = 0;
    const seenTypes = new Set();
    for (const hIdx of v.hexes || []) {
      const hex = state.hexes[hIdx];
      if (!hex || hex.type === 'desert') continue;
      const weight = DICE_WEIGHT[hex.number] || 0;
      score += weight;
      if (!seenTypes.has(hex.type)) {
        score += 0.8 + (RESOURCE_VALUE[hex.type] || 0);
        seenTypes.add(hex.type);
      }
      if (state.robber === hex.index) score -= 1.25;
    }
    return score;
  }

  function pickBestVertex(state, candidates) {
    if (!candidates.length) return null;
    let best = candidates[0];
    let bestScore = -Infinity;
    for (const idx of candidates) {
      const s = scoreVertex(state, idx);
      if (s > bestScore) {
        bestScore = s;
        best = idx;
      }
    }
    return best;
  }

  function edgeTouchesVertex(edge, vertexIdx) {
    return edge.a === vertexIdx || edge.b === vertexIdx;
  }

  function pickBestRoadFromVertex(state, edgeCandidates, anchorVertex) {
    if (!edgeCandidates.length) return null;
    if (anchorVertex == null) return edgeCandidates[0];

    let best = edgeCandidates[0];
    let bestScore = -Infinity;

    for (const eIdx of edgeCandidates) {
      const e = state.edges[eIdx];
      if (!e) continue;
      if (!edgeTouchesVertex(e, anchorVertex)) continue;
      const nextVertex = e.a === anchorVertex ? e.b : e.a;
      const s = scoreVertex(state, nextVertex);
      if (s > bestScore) {
        bestScore = s;
        best = eIdx;
      }
    }
    return best;
  }

  function pickBestRoadGeneral(state, edgeCandidates, playerIdx) {
    if (!edgeCandidates.length) return null;
    let best = edgeCandidates[0];
    let bestScore = -Infinity;

    for (const eIdx of edgeCandidates) {
      const e = state.edges[eIdx];
      if (!e) continue;
      const a = state.vertices[e.a];
      const b = state.vertices[e.b];
      const ends = [a, b];
      let score = 0;
      for (const v of ends) {
        if (!v) continue;
        if (v.owner === playerIdx) score += 1.2;
        if (v.owner === null) score += 0.6;
        score += Math.max(0, scoreVertex(state, v.index)) * 0.35;
      }
      if (score > bestScore) {
        bestScore = score;
        best = eIdx;
      }
    }
    return best;
  }

  function pickRobberTarget(state, thiefIdx) {
    let bestHex = null;
    let bestVictim = null;
    let bestScore = -Infinity;

    for (const hex of state.hexes) {
      if (!hex || hex.index === state.robber || hex.type === 'desert') continue;
      const weight = DICE_WEIGHT[hex.number] || 0;

      const touched = new Map();
      for (const vIdx of hex.vertices || []) {
        const v = state.vertices[vIdx];
        if (!v || v.owner == null || v.owner === thiefIdx) continue;
        const amount = v.building === 'city' ? 2 : 1;
        touched.set(v.owner, (touched.get(v.owner) || 0) + amount);
      }

      const pressureBonus = touched.size * 0.7;
      for (const [victim, pips] of touched.entries()) {
        const victimRes = Object.values(state.players[victim].resources || {}).reduce((a, b) => a + b, 0);
        const score = weight * 1.7 + pips * 2.2 + Math.min(victimRes, 12) * 0.12 + pressureBonus;
        if (score > bestScore) {
          bestScore = score;
          bestHex = hex.index;
          bestVictim = victim;
        }
      }
    }

    if (bestHex == null) {
      const fallback = state.hexes.find(h => h && h.index !== state.robber);
      return { hexIndex: fallback ? fallback.index : state.robber, victimIdx: null };
    }
    return { hexIndex: bestHex, victimIdx: bestVictim };
  }

  function chooseBuildAction(state, playerIdx, options) {
    const p = state.players[playerIdx];
    if (!p) return null;

    const has = (cost) => Object.entries(cost).every(([k, v]) => (p.resources[k] || 0) >= v);

    if (options.cityCount > 0 && has(options.costs.city)) return 'city';
    if (options.settlementCount > 0 && has(options.costs.settlement)) return 'settlement';
    if (options.roadCount > 0 && has(options.costs.road)) return 'road';
    return null;
  }

  function getTurnBudget(difficulty, totalResources) {
    if (difficulty === 'easy') return 1;
    if (difficulty === 'hard') return totalResources >= 8 ? 4 : 3;
    return totalResources >= 8 ? 3 : 2;
  }

  function shouldStopBuilding(difficulty, buildsDone, remainingResources) {
    if (remainingResources <= 2) return true;
    if (difficulty === 'easy') return buildsDone >= 0;
    if (difficulty === 'hard') return buildsDone >= 2;
    return buildsDone >= 1;
  }

  // Returns true if playing a knight card is strategically good right now.
  // Does NOT check whether the player actually holds a knight — callers do that.
  function shouldUseKnight(state, playerIdx) {
    const p = state.players[playerIdx];
    if (!p) return false;
    const myVP = p.vp || 0;
    const myRes = Object.values(p.resources || {}).reduce((a, b) => a + b, 0);
    for (let i = 0; i < state.players.length; i++) {
      if (i === playerIdx) continue;
      const opp = state.players[i];
      const oppRes = Object.values(opp.resources || {}).reduce((a, b) => a + b, 0);
      const oppVP = opp.vp || 0;
      if (oppRes >= 5 || oppVP > myVP) return true;
    }
    if (myRes < 3) return true;
    return false;
  }

  function chooseBankTrade(resources, targetCost) {
    const entries = Object.entries(resources || {});
    const givers = entries
      .filter(([, count]) => count >= 4)
      .sort((a, b) => b[1] - a[1]);
    if (!givers.length) return null;

    const deficits = Object.entries(targetCost || {})
      .map(([res, need]) => [res, need - (resources[res] || 0)])
      .filter(([, deficit]) => deficit > 0)
      .sort((a, b) => b[1] - a[1]);

    if (!deficits.length) return null;

    const [give] = givers[0];
    const [get] = deficits[0];
    if (give === get) return null;
    return { give, get };
  }

  return {
    scoreVertex,
    pickBestVertex,
    pickBestRoadFromVertex,
    pickBestRoadGeneral,
    pickRobberTarget,
    chooseBuildAction,
    getTurnBudget,
    shouldStopBuilding,
    chooseBankTrade,
    shouldUseKnight
  };
});
