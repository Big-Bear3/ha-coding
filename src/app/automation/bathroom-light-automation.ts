import { onChange } from '../../../index.js';

onChange(
    () => null,
    () => {}
);

// onChange(
//     () => [light.status, light.gradient] as const,
//     ([status, gradient]) => {
//         assert.deepStrictEqual(gradient, { on: 500, off: 600 });
//         flag++;
//     }
// );
