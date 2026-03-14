import { describe } from 'node:test';
import { MiLight } from './devices-def/mi-light.js';
import assert from 'assert';
import { onSwitch, ref } from '../index.js';

describe('onSwitch - 精确匹配 from/to', () => {
    const light = new MiLight();
    let flag = 0;

    setTimeout(() => {
        onSwitch(
            () => light.status,
            1, 2,
            () => { flag++; }
        );

        // 不匹配：0 → 1
        light.status = 1;

        setTimeout(() => {
            // 匹配：1 → 2
            light.status = 2;

            setTimeout(() => {
                // 不匹配：2 → 3
                light.status = 3;

                setTimeout(() => {
                    assert.strictEqual(flag, 1);
                }, 100);
            }, 100);
        }, 100);
    }, 100);
});

describe('onSwitch - from * (任意值→目标值，排除目标值本身)', () => {
    const v = ref(0);
    let flag = 0;

    setTimeout(() => {
        onSwitch(
            () => v.value,
            '*', 5,
            () => { flag++; }
        );

        // 0 → 5, 匹配 (* → 5, oldVal=0 !== 5)
        v.value = 5;

        setTimeout(() => {
            // 5 → 10, 不匹配 (newVal=10 !== to=5)
            v.value = 10;

            setTimeout(() => {
                // 10 → 5, 匹配 (* → 5, oldVal=10 !== 5)
                v.value = 5;

                setTimeout(() => {
                    assert.strictEqual(flag, 2);
                }, 100);
            }, 100);
        }, 100);
    }, 100);
});

describe('onSwitch - from ** (任意值→目标值，包括目标值本身)', () => {
    const v = ref(0);
    let flag = 0;

    setTimeout(() => {
        // ** 和 * 在 onChange 场景下行为对等，因为 onChange 只在值变化时触发
        // 本质区别在于：* 会额外检查 oldVal !== to，** 不检查
        // 但因为 onChange 本身保证 oldVal !== newVal，如果 newVal === to，则 oldVal !== to 自动成立
        // 所以在常规场景下两者等价，这里验证 ** 也能正常工作
        onSwitch(
            () => v.value,
            '**', 5,
            () => { flag++; }
        );

        // 0 → 5, 匹配
        v.value = 5;

        setTimeout(() => {
            // 5 → 10, 不匹配 (newVal !== 5)
            v.value = 10;

            setTimeout(() => {
                // 10 → 5, 匹配
                v.value = 5;

                setTimeout(() => {
                    assert.strictEqual(flag, 2);
                }, 100);
            }, 100);
        }, 100);
    }, 100);
});

describe('onSwitch - to * (特定值→任意值，排除特定值本身)', () => {
    const v = ref(0);
    let flag = 0;

    setTimeout(() => {
        onSwitch(
            () => v.value,
            3, '*',
            () => { flag++; }
        );

        // 0 → 3, 不匹配 (newVal=3, to=*, from=3, 但 oldVal=0 !== from=3)
        v.value = 3;

        setTimeout(() => {
            // 3 → 7, 匹配 (oldVal=3 === from=3, newVal=7 !== from=3)
            v.value = 7;

            setTimeout(() => {
                // 7 → 3, 不匹配 (oldVal=7 !== from=3)
                v.value = 3;

                setTimeout(() => {
                    // 3 → 0, 匹配 (oldVal=3 === from=3, newVal=0 !== from=3)
                    v.value = 0;

                    setTimeout(() => {
                        assert.strictEqual(flag, 2);
                    }, 100);
                }, 100);
            }, 100);
        }, 100);
    }, 100);
});

describe('onSwitch - to ** (特定值→任意值，包括特定值本身)', () => {
    const v = ref(0);
    let flag = 0;

    setTimeout(() => {
        onSwitch(
            () => v.value,
            3, '**',
            () => { flag++; }
        );

        // 0 → 3, 不匹配 (oldVal=0 !== from=3)
        v.value = 3;

        setTimeout(() => {
            // 3 → 7, 匹配 (oldVal=3 === from=3, to=** 匹配任意)
            v.value = 7;

            setTimeout(() => {
                assert.strictEqual(flag, 1);
            }, 100);
        }, 100);
    }, 100);
});

describe('onSwitch - from * to * (任意值→任意值，互相排除)', () => {
    const v = ref(0);
    let flag = 0;

    setTimeout(() => {
        // from=* to=* 等价于任何变化都触发 (因为 onChange 保证 old !== new，
        // 而 * 在对端也是通配时不做额外排除)
        onSwitch(
            () => v.value,
            '*', '*',
            () => { flag++; }
        );

        v.value = 1;

        setTimeout(() => {
            v.value = 2;

            setTimeout(() => {
                v.value = 3;

                setTimeout(() => {
                    assert.strictEqual(flag, 3);
                }, 100);
            }, 100);
        }, 100);
    }, 100);
});

describe('onSwitch - 布尔值转换', () => {
    const occupied = ref(true);
    let flag = 0;

    setTimeout(() => {
        onSwitch(
            () => occupied.value,
            true, false,
            () => { flag++; }
        );

        // true → false, 匹配
        occupied.value = false;

        setTimeout(() => {
            // false → true, 不匹配
            occupied.value = true;

            setTimeout(() => {
                // true → false, 匹配
                occupied.value = false;

                setTimeout(() => {
                    assert.strictEqual(flag, 2);
                }, 100);
            }, 100);
        }, 100);
    }, 100);
});

describe('onSwitch - pause/resume', () => {
    const v = ref(0);
    let flag = 0;

    setTimeout(() => {
        const { pause, resume } = onSwitch(
            () => v.value,
            '*', 10,
            () => { flag++; }
        );

        // 0 → 10, 匹配
        v.value = 10;

        setTimeout(() => {
            assert.strictEqual(flag, 1);

            pause();

            // 暂停后不触发
            v.value = 0;

            setTimeout(() => {
                v.value = 10;

                setTimeout(() => {
                    // 暂停期间不应触发
                    assert.strictEqual(flag, 1);

                    resume();

                    // 恢复后: 10 → 20, 不匹配 (newVal !== 10)
                    v.value = 20;

                    setTimeout(() => {
                        // 20 → 10, 匹配
                        v.value = 10;

                        setTimeout(() => {
                            assert.strictEqual(flag, 2);
                        }, 100);
                    }, 100);
                }, 100);
            }, 100);
        }, 100);
    }, 100);
});

describe('onSwitch - 回调参数验证', () => {
    const v = ref<string>('a');
    let flag = 0;

    setTimeout(() => {
        onSwitch(
            () => v.value,
            'a', 'b',
            (newVal, oldVal) => {
                assert.strictEqual(newVal, 'b');
                assert.strictEqual(oldVal, 'a');
                flag++;
            }
        );

        v.value = 'b';

        setTimeout(() => {
            assert.strictEqual(flag, 1);
        }, 100);
    }, 100);
});

describe('onSwitch - 设备状态精确匹配', () => {
    const light = new MiLight();
    let flag = 0;

    setTimeout(() => {
        // colorTemperature 初始值 4000
        onSwitch(
            () => light.colorTemperature,
            4000, 6500,
            () => { flag++; }
        );

        // 4000 → 5000, 不匹配 (to !== 6500)
        light.colorTemperature = 5000;

        setTimeout(() => {
            // 5000 → 6500, 不匹配 (from !== 4000)
            light.colorTemperature = 6500;

            setTimeout(() => {
                // 还原
                light.colorTemperature = 4000;

                setTimeout(() => {
                    // 4000 → 6500, 匹配!
                    light.colorTemperature = 6500;

                    setTimeout(() => {
                        assert.strictEqual(flag, 1);
                    }, 100);
                }, 100);
            }, 100);
        }, 100);
    }, 100);
});
