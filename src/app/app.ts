import { initHACoding } from '../../index.js';

import('./devices.js');

initHACoding().then(() => {
    import('./automation/index.js');
});
