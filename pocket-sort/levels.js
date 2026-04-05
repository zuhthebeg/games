(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PocketSortLevels = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const LEVELS = [
    { id: 1, name: 'Warmup', bins: ['lip', 'usb'], tray: ['usb', 'lip', 'usb', 'lip'] },
    { id: 2, name: 'Daily Kit', bins: ['key', 'battery'], tray: ['battery', 'key', 'key', 'battery'] },
    { id: 3, name: 'Desk Reset', bins: ['card', 'ring'], tray: ['ring', 'card', 'card', 'ring'] },
    { id: 4, name: 'Pocket Trio', bins: ['lip', 'usb', 'battery'], tray: ['battery', 'usb', 'lip', 'lip', 'usb', 'battery'] },
    { id: 5, name: 'Beauty Tray', bins: ['lip', 'ring', 'card'], tray: ['ring', 'lip', 'card', 'lip', 'ring', 'card'] },
    { id: 6, name: 'Tech Bag', bins: ['usb', 'battery', 'key'], tray: ['key', 'usb', 'battery', 'battery', 'usb', 'key'] },
    { id: 7, name: 'Four Fit', bins: ['lip', 'usb', 'battery', 'ring'], tray: ['ring', 'lip', 'battery', 'usb', 'battery', 'ring', 'usb', 'lip'] },
    { id: 8, name: 'Travel Case', bins: ['card', 'key', 'battery', 'usb'], tray: ['key', 'usb', 'card', 'battery', 'usb', 'battery', 'key', 'card'] },
    { id: 9, name: 'Accessorize', bins: ['ring', 'lip', 'card', 'earbud'], tray: ['earbud', 'card', 'lip', 'ring', 'card', 'earbud', 'ring', 'lip'] },
    { id: 10, name: 'Pocket Grid', bins: ['lip', 'usb', 'battery', 'card'], tray: ['battery', 'lip', 'card', 'usb', 'usb', 'card', 'lip', 'battery'] },
    { id: 11, name: 'Five Labels', bins: ['lip', 'usb', 'battery', 'ring', 'card'], tray: ['card', 'ring', 'battery', 'usb', 'lip', 'lip', 'usb', 'battery', 'ring', 'card'] },
    { id: 12, name: 'Office Loadout', bins: ['card', 'key', 'usb', 'earbud', 'battery'], tray: ['battery', 'earbud', 'usb', 'key', 'card', 'card', 'key', 'usb', 'earbud', 'battery'] },
    { id: 13, name: 'Color Pass', bins: ['lip', 'ring', 'earbud', 'key', 'battery'], tray: ['earbud', 'lip', 'battery', 'key', 'ring', 'ring', 'key', 'lip', 'earbud', 'battery'] },
    { id: 14, name: 'Weekend Bag', bins: ['card', 'ring', 'usb', 'key', 'lip'], tray: ['lip', 'key', 'usb', 'ring', 'card', 'ring', 'card', 'usb', 'lip', 'key'] },
    { id: 15, name: 'Rush Order', bins: ['battery', 'card', 'earbud', 'ring', 'usb'], tray: ['usb', 'ring', 'earbud', 'card', 'battery', 'battery', 'card', 'usb', 'ring', 'earbud'] },
    { id: 16, name: 'Six Pocket', bins: ['lip', 'usb', 'battery', 'ring', 'card', 'key'], tray: ['key', 'card', 'ring', 'battery', 'usb', 'lip', 'lip', 'usb', 'battery', 'ring', 'card', 'key'] },
    { id: 17, name: 'Audio Pack', bins: ['earbud', 'usb', 'battery', 'card', 'ring', 'lip'], tray: ['lip', 'ring', 'card', 'battery', 'usb', 'earbud', 'earbud', 'usb', 'battery', 'card', 'ring', 'lip'] },
    { id: 18, name: 'Collector', bins: ['key', 'card', 'earbud', 'lip', 'battery', 'usb'], tray: ['usb', 'battery', 'lip', 'earbud', 'card', 'key', 'key', 'card', 'earbud', 'lip', 'battery', 'usb'] },
    { id: 19, name: 'Last Call', bins: ['ring', 'key', 'card', 'battery', 'earbud', 'lip'], tray: ['lip', 'earbud', 'battery', 'card', 'key', 'ring', 'ring', 'key', 'card', 'battery', 'earbud', 'lip'] },
    { id: 20, name: 'Final Pocket', bins: ['lip', 'usb', 'battery', 'ring', 'card', 'earbud'], tray: ['earbud', 'card', 'ring', 'battery', 'usb', 'lip', 'lip', 'usb', 'battery', 'ring', 'card', 'earbud'] }
  ];

  return { LEVELS };
});
