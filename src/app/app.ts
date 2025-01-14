import { initHACoding } from '../../index.js';

initHACoding().then(() => {
    import('./devices.js').then(() => {
        import('./automation/index.js');
    });
});
