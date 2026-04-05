(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PocketSortLevels = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const LEVELS = [
    { id: 1, name: 'Pocket Warmup', pockets: [['lip', 'usb'], ['battery'], ['usb', 'battery'], ['ring', 'card'], ['card', 'ring', 'lip'], []] },
    { id: 2, name: 'Key Pair', pockets: [['key', 'lip'], ['usb', 'key'], ['battery', 'usb'], ['lip', 'battery'], ['ring', 'ring'], []] },
    { id: 3, name: 'Card Stack', pockets: [['card', 'ring'], ['battery', 'card'], ['ring', 'usb'], ['usb', 'battery'], ['lip', 'lip'], []] },
    { id: 4, name: 'Triple Pocket', pockets: [['lip', 'usb', 'battery'], ['battery', 'lip', 'usb'], ['ring', 'card', 'ring'], ['card', 'key', 'key'], [], []] },
    { id: 5, name: 'Mix and Match', pockets: [['key', 'battery', 'lip'], ['usb', 'key', 'card'], ['battery', 'card', 'usb'], ['ring', 'lip', 'ring'], [], []] },
    { id: 6, name: 'Cable Nest', pockets: [['usb', 'ring', 'battery'], ['battery', 'lip', 'card'], ['card', 'usb', 'key'], ['key', 'ring', 'lip'], [], []] },
    { id: 7, name: 'Four Item Sort', pockets: [['lip', 'usb', 'battery', 'ring'], ['ring', 'battery', 'usb', 'lip'], ['card', 'key', 'card', 'key'], [], [], []] },
    { id: 8, name: 'Battery Drawer', pockets: [['battery', 'key', 'ring', 'card'], ['card', 'ring', 'key', 'battery'], ['lip', 'usb', 'lip', 'usb'], [], [], []] },
    { id: 9, name: 'Travel Kit', pockets: [['usb', 'lip', 'card', 'ring'], ['key', 'battery', 'usb', 'card'], ['ring', 'lip', 'battery', 'key'], [], [], []] },
    { id: 10, name: 'Pocket Grid', pockets: [['lip', 'card', 'usb', 'battery'], ['battery', 'usb', 'ring', 'lip'], ['card', 'ring', 'key', 'key'], [], [], []] },
    { id: 11, name: 'Six Things', pockets: [['lip', 'usb', 'battery', 'ring'], ['card', 'key', 'lip', 'usb'], ['battery', 'ring', 'card', 'key'], [], [], []] },
    { id: 12, name: 'Mirror Toss', pockets: [['ring', 'card', 'usb', 'lip'], ['lip', 'usb', 'card', 'ring'], ['key', 'battery', 'key', 'battery'], [], [], []] },
    { id: 13, name: 'Tight Drawer', pockets: [['usb', 'battery', 'card', 'key'], ['ring', 'lip', 'usb', 'battery'], ['key', 'card', 'lip', 'ring'], [], [], []] },
    { id: 14, name: 'Double Pocket', pockets: [['lip', 'battery', 'ring', 'key'], ['card', 'usb', 'lip', 'battery'], ['key', 'ring', 'card', 'usb'], [], [], []] },
    { id: 15, name: 'Rush Hour', pockets: [['card', 'lip', 'battery', 'usb'], ['ring', 'key', 'card', 'lip'], ['usb', 'battery', 'ring', 'key'], [], [], []] },
    { id: 16, name: 'Seven Objects', pockets: [['lip', 'usb', 'battery', 'ring'], ['card', 'key', 'earbud', 'lip'], ['usb', 'battery', 'ring', 'card'], ['key', 'earbud'], [], []] },
    { id: 17, name: 'Earbud Tangle', pockets: [['earbud', 'key', 'card', 'usb'], ['battery', 'lip', 'ring', 'earbud'], ['usb', 'card', 'battery', 'key'], ['ring', 'lip'], [], []] },
    { id: 18, name: 'Pocket Overflow', pockets: [['lip', 'card', 'earbud', 'ring'], ['usb', 'battery', 'key', 'lip'], ['ring', 'earbud', 'card', 'usb'], ['key', 'battery'], [], []] },
    { id: 19, name: 'Collector Case', pockets: [['battery', 'earbud', 'lip', 'card'], ['ring', 'usb', 'battery', 'key'], ['card', 'lip', 'ring', 'earbud'], ['key', 'usb'], [], []] },
    { id: 20, name: 'Final Pocket', pockets: [['key', 'ring', 'earbud', 'battery'], ['card', 'lip', 'usb', 'key'], ['battery', 'earbud', 'ring', 'card'], ['usb', 'lip'], [], []] }
  ];

  return { LEVELS };
});
