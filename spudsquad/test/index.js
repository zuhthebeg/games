// Node 24 treats explicit directories as module entrypoints; load the suite here.
require('./sim.test.cjs');
require('./net.test.cjs');
require('./char-stats.test.cjs');
require('./v2-combat.test.cjs');
require('./v2-growth.test.cjs');
require('./solo-save.test.cjs');
require('./solo-main.test.cjs');
require('./ui-display.test.cjs');
require('./economy-choices.test.cjs');
require('./collection.test.cjs');
require('./enemies-v3.test.cjs');
require('./items-v3.test.cjs');
require('./endless.test.cjs');
require('./content-v4.test.cjs');
require('./v5-multi.test.cjs');
require('./balance-v6.test.cjs');

require('./ult.test.cjs');
