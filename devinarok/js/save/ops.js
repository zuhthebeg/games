const SLOTS = new Set(['weapon', 'head', 'body', 'hands', 'feet']);

function integer(value, label, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) throw new TypeError(`${label} must be an integer >= ${minimum}`);
  return value;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function applyOperations(character, itemMap, operations, characterId) {
  let nextCharacter = character ? clone(character) : null;
  const nextItems = clone(itemMap);
  for (const operation of operations) {
    if (!operation || typeof operation.type !== 'string') throw new TypeError('Invalid save operation');
    if (operation.type === 'createCharacter') {
      if (nextCharacter) throw new Error('Character already exists');
      const name = String(operation.name ?? '').trim();
      if (name.length < 1 || name.length > 12) throw new TypeError('Character name must be 1–12 characters');
      if (operation.kind !== 'knight') throw new TypeError('Only the Knight class is available in M0');
      nextCharacter = {
        id: characterId,
        name,
        kind: operation.kind,
        level: 1,
        xp: 0,
        gold: 0,
        rev: 0,
        equipment: { weapon: null, head: null, body: null, hands: null, feet: null },
        clearedStages: [],
      };
      continue;
    }
    if (!nextCharacter) throw new Error('Create a character before applying operations');
    switch (operation.type) {
      case 'gainXp': {
        nextCharacter.xp += integer(operation.amount, 'XP');
        while (nextCharacter.xp >= nextCharacter.level * 100) {
          nextCharacter.xp -= nextCharacter.level * 100;
          nextCharacter.level += 1;
        }
        break;
      }
      case 'grantGold':
        nextCharacter.gold += integer(operation.amount, 'Gold');
        break;
      case 'spendGold': {
        const amount = integer(operation.amount, 'Gold');
        if (nextCharacter.gold < amount) throw new RangeError('Gold cannot become negative');
        nextCharacter.gold -= amount;
        break;
      }
      case 'grantItem': {
        if (!operation.uid || !operation.itemId || nextItems[operation.uid]) throw new TypeError('Invalid or duplicate item');
        nextItems[operation.uid] = {
          uid: operation.uid,
          characterId,
          itemId: String(operation.itemId),
          rarity: String(operation.rarity ?? 'common'),
          enhance: integer(operation.enhance ?? 0, 'Enhance'),
          affixes: Array.isArray(operation.affixes) ? clone(operation.affixes) : [],
          slot: null,
        };
        break;
      }
      case 'removeItem': {
        const item = nextItems[operation.uid];
        if (!item || item.characterId !== characterId) throw new Error('Item is not owned by this character');
        if (item.slot) nextCharacter.equipment[item.slot] = null;
        delete nextItems[operation.uid];
        break;
      }
      case 'equip': {
        const item = nextItems[operation.uid];
        if (!item || item.characterId !== characterId) throw new Error('Item is not owned by this character');
        if (!SLOTS.has(operation.slot)) throw new TypeError('Invalid equipment slot');
        if (item.slot) nextCharacter.equipment[item.slot] = null;
        const previouslyEquipped = nextCharacter.equipment[operation.slot];
        if (previouslyEquipped && nextItems[previouslyEquipped]) nextItems[previouslyEquipped].slot = null;
        item.slot = operation.slot;
        nextCharacter.equipment[operation.slot] = item.uid;
        break;
      }
      case 'unequip': {
        if (!SLOTS.has(operation.slot)) throw new TypeError('Invalid equipment slot');
        const uid = nextCharacter.equipment[operation.slot];
        if (uid && nextItems[uid]) nextItems[uid].slot = null;
        nextCharacter.equipment[operation.slot] = null;
        break;
      }
      case 'clearStage': {
        const stageId = String(operation.stageId ?? '');
        if (!stageId) throw new TypeError('stageId is required');
        if (!nextCharacter.clearedStages.includes(stageId)) nextCharacter.clearedStages.push(stageId);
        break;
      }
      default:
        throw new TypeError(`Unknown save operation: ${operation.type}`);
    }
  }
  if (!nextCharacter) throw new Error('No character was created');
  return { character: nextCharacter, items: nextItems };
}
