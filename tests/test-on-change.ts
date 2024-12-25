import { describe } from 'node:test';
import { MiLight } from './devices-def/mi-light.js';
import assert from 'assert';
import { onChange, ref } from '../index.js';
import { nextTick } from 'process';

describe('事件', () => {
    const light = new MiLight();

    setTimeout(() => {
        let flag = 0;

        /** 一个事件 */
        onChange(
            () => light.turnOn,
            (turnOn, oldTurnOn) => {
                assert.strictEqual(turnOn, 333);
                assert.strictEqual(oldTurnOn, undefined);
                flag++;
            }
        );

        /** 多个事件 */
        onChange(
            () => [light.turnOn, light.turnOff] as const,
            ([turnOn, turnOff], [oldTurnOn, oldTurnOff]) => {
                if (turnOff) {
                    assert.strictEqual(turnOn, undefined);
                    assert.strictEqual(turnOff, '张-3');
                    assert.strictEqual(oldTurnOn, undefined);
                    assert.strictEqual(oldTurnOff, undefined);
                    flag++;
                } else {
                    assert.strictEqual(turnOn, 333);
                    assert.strictEqual(oldTurnOn, undefined);
                    assert.strictEqual(oldTurnOff, undefined);
                    flag++;
                }
            }
        );

        light.turnOn(333);

        nextTick(() => {
            light.turnOff('张', 3);
        });

        setTimeout(() => {
            assert.strictEqual(flag, 3);
        }, 10);
    }, 1);
});

describe('事件immediate', () => {
    const light = new MiLight();

    setTimeout(() => {
        let flag = 0;
        let isFirst = true;

        /** 一个事件 */
        onChange(
            () => light.turnOn,
            (turnOn, oldTurnOn) => {
                if (isFirst) {
                    assert.strictEqual(turnOn, undefined);
                    assert.strictEqual(oldTurnOn, undefined);
                    flag++;
                } else {
                    assert.strictEqual(turnOn, 333);
                    assert.strictEqual(oldTurnOn, undefined);
                    flag++;
                }
            },
            { immediate: true }
        );

        /** 多个事件 */
        onChange(
            () => [light.turnOn, light.turnOff] as const,
            ([turnOn, turnOff], [oldTurnOn, oldTurnOff]) => {
                if (isFirst) {
                    assert.strictEqual(turnOn, undefined);
                    assert.strictEqual(oldTurnOn, undefined);
                    assert.strictEqual(turnOff, undefined);
                    assert.strictEqual(oldTurnOff, undefined);
                    flag++;
                } else {
                    if (turnOff) {
                        assert.strictEqual(turnOn, undefined);
                        assert.strictEqual(turnOff, '张-3');
                        assert.strictEqual(oldTurnOn, undefined);
                        assert.strictEqual(oldTurnOff, undefined);
                        flag++;
                    } else {
                        assert.strictEqual(turnOn, 333);
                        assert.strictEqual(oldTurnOn, undefined);
                        assert.strictEqual(oldTurnOff, undefined);
                        flag++;
                    }
                }
            },
            { immediate: true }
        );

        isFirst = false;

        light.turnOn(333);

        nextTick(() => {
            light.turnOff('张', 3);
        });

        setTimeout(() => {
            assert.strictEqual(flag, 5);
        }, 10);
    }, 1);
});

describe('状态', () => {
    const light = new MiLight();

    setTimeout(() => {
        assert.strictEqual(light.colorTemperature, 4000);

        let flag = 0;

        onChange(
            () => light.colorTemperature,
            (colorTemperature, oldColorTemperature) => {
                if (colorTemperature === 4500) {
                    flag++;
                    return;
                }
                assert.strictEqual(colorTemperature, 4000);
                assert.strictEqual(oldColorTemperature, undefined);
                flag++;
            },
            {
                immediate: true
            }
        );

        /** 一个状态 */
        onChange(
            () => light.status,
            (status, oldStatus) => {
                if (oldStatus) {
                    assert.strictEqual(status, 2);
                    assert.strictEqual(oldStatus, 1);
                    flag++;
                } else {
                    assert.strictEqual(status, 1);
                    flag++;
                }
            }
        );

        /** 多个状态 */
        onChange(
            () => [light.brightness, light.colorTemperature] as const,
            ([brightness, colorTemperature], [oldBrightness, oldColorTemperature]) => {
                if (brightness === '80%') {
                    assert.strictEqual(colorTemperature, 4000);
                    assert.strictEqual(oldBrightness, undefined);
                    assert.strictEqual(oldColorTemperature, 4000);
                    flag++;
                } else {
                    assert.strictEqual(colorTemperature, 4500);
                    assert.strictEqual(oldBrightness, '80%');
                    assert.strictEqual(oldColorTemperature, 4000);
                    flag++;
                }
            }
        );

        light.status = 1;

        nextTick(() => {
            light.status = 2;
        });

        setTimeout(() => {
            light.brightness = '80%';

            nextTick(() => {
                light.brightness = '100%';
                light.colorTemperature = 4500;
            });
        }, 1);

        setTimeout(() => {
            assert.strictEqual(flag, 6);
        }, 10);
    }, 1);
});

describe('变量', () => {
    let flag = 0;
    let isFirst = true;
    const v1 = ref(123);
    const v2 = ref(456);
    const v3 = ref<number>();

    /** 一个变量 */
    onChange(
        () => v1.value,
        (v1, oldV1) => {
            if (isFirst) {
                assert.strictEqual(v1, 123);
                assert.strictEqual(oldV1, undefined);
                flag++;
            } else {
                assert.strictEqual(v1, 1234);
                assert.strictEqual(oldV1, 123);
                flag++;
            }
        },
        { immediate: true }
    );

    /** 多个变量 */
    onChange(
        () => [v1.value, v2.value, v3.value] as const,
        ([v1, v2, v3], [oldV1, oldV2, oldV3]) => {
            if (isFirst) {
                assert.strictEqual(v1, 123);
                assert.strictEqual(v2, 456);
                assert.strictEqual(v3, undefined);
                assert.strictEqual(oldV1, undefined);
                assert.strictEqual(oldV2, undefined);
                assert.strictEqual(oldV3, undefined);
                flag++;
            } else {
                assert.strictEqual(v1, 1234);
                assert.strictEqual(v2, 4567);
                assert.strictEqual(v3, 1000);
                assert.strictEqual(oldV1, 123);
                assert.strictEqual(oldV2, 456);
                assert.strictEqual(oldV3, undefined);
                flag++;
            }
        },
        { immediate: true }
    );

    isFirst = false;

    v1.value = 1234;
    v2.value = 4567;
    v3.value = 1000;

    setTimeout(() => {
        assert.strictEqual(flag, 4);
    }, 10);
});

describe('混合', () => {
    const light = new MiLight();
    const v1 = ref(123);
    const v2 = ref(456);
    let flag = 0;

    /** 多个变量 */
    onChange(
        () => [light.status, light.turnOn, v1.value, v2.value] as const,
        ([status, turnOn, v1, v2], [oldStatus, oldTurnOn, oldV1, oldV2]) => {
            if (flag === 0) {
                assert.strictEqual(light.colorTemperature, 4000);
                assert.strictEqual(status, -1);
                assert.strictEqual(light.status, -1);
                assert.strictEqual(turnOn, 666);
                assert.strictEqual(v1, 1);
                assert.strictEqual(v2, 2);
                flag++;
            } else if (flag === 1) {
                assert.strictEqual(status, -2);
                assert.strictEqual(turnOn, undefined);
                assert.strictEqual(v1, 1);
                assert.strictEqual(v2, 2);
                assert.strictEqual(oldStatus, -1);
                assert.strictEqual(oldTurnOn, undefined);
                assert.strictEqual(oldV1, 1);
                assert.strictEqual(oldV2, 2);
                flag++;
            } else if (flag === 2) {
                assert.strictEqual(status, -2);
                assert.strictEqual(turnOn, 888);
                assert.strictEqual(v1, 1);
                assert.strictEqual(v2, 2);
                assert.strictEqual(oldStatus, -2);
                assert.strictEqual(oldTurnOn, undefined);
                assert.strictEqual(oldV1, 1);
                assert.strictEqual(oldV2, 2);
                flag++;
            } else if (flag === 3) {
                assert.strictEqual(status, -2);
                assert.strictEqual(turnOn, undefined);
                assert.strictEqual(v1, 11);
                assert.strictEqual(v2, 22);
                assert.strictEqual(oldStatus, -2);
                assert.strictEqual(oldTurnOn, undefined);
                assert.strictEqual(oldV1, 1);
                assert.strictEqual(oldV2, 2);
                flag++;
            }
        }
    );

    light.status = -1;
    light.turnOn(666);
    v1.value = 1;
    v2.value = 2;

    nextTick(() => {
        light.status = -2;

        nextTick(() => {
            light.turnOn(888);

            nextTick(() => {
                v1.value = 11;
                v2.value = 22;
            });
        });
    });

    setTimeout(() => {
        assert.strictEqual(flag, 4);
    }, 10);
});

describe('暂停&恢复', () => {
    const light = new MiLight();
    let flag = 0;

    const { pause, resume } = onChange(
        () => [light.turnOn, light.colorTemperature] as const,
        ([turnOn, colorTemperature], [oldTurnOn, oldColorTemperature]) => {
            if (flag === 0) {
                assert.strictEqual(light.colorTemperature, 4000);
                flag++;
            } else {
                assert.strictEqual(turnOn, 2);
                assert.strictEqual(colorTemperature, 6000);
                assert.strictEqual(oldTurnOn, undefined);
                assert.strictEqual(oldColorTemperature, 4000);
                flag++;
            }
        },
        { immediate: true }
    );

    pause();

    nextTick(() => {
        light.turnOn(1);
        light.colorTemperature = 5000;
    });

    setTimeout(() => {
        resume();
        light.turnOn(2);
        light.colorTemperature = 6000;
    }, 1);

    setTimeout(() => {
        assert.strictEqual(flag, 2);
    }, 10);
});

describe('对象类型', () => {
    const light = new MiLight();
    let flag = 0;

    setTimeout(() => {
        onChange(
            () => [light.status, light.gradient] as const,
            ([status, gradient]) => {
                assert.deepStrictEqual(gradient, { on: 500, off: 600 });
                flag++;
            }
        );

        light.gradient = { on: 500, off: 600 };

        setTimeout(() => {
            light.gradient.on = 400;
        }, 1);

        setTimeout(() => {
            assert.strictEqual(flag, 1);
        }, 10);
    }, 1);
});

describe('自由组合', () => {
    const light = new MiLight();
    let flag = 0;

    setTimeout(() => {
        onChange(
            () => ({ status: light.status, brightness: light.brightness, turnOn: light.turnOn } as const),
            ({ status, brightness, turnOn }) => {
                assert.strictEqual(status, 10);
                assert.strictEqual(brightness, '50%');
                assert.strictEqual(typeof turnOn, 'function');
                flag++;
            }
        );

        light.status = 10;
        light.brightness = '50%';

        setTimeout(() => {
            light.turnOn(-1);
        }, 1);

        setTimeout(() => {
            assert.strictEqual(flag, 2);
        }, 10);
    }, 1);
});

describe('@State装饰ref变量', () => {
    const light = new MiLight();
    let flag = 0;

    setTimeout(() => {
        onChange(
            () => light.color.value,
            (color) => {
                if (flag === 0) {
                    assert.strictEqual(color, 'red');
                    flag++;
                } else if (flag === 1) {
                    assert.strictEqual(color, 'yellow');
                    flag++;
                } else if (flag === 2) {
                    assert.strictEqual(color, 'green');
                    flag++;
                }
            },
            { immediate: true }
        );

        light.color.value = 'yellow';

        setTimeout(() => {
            light.color = ref('green');
        }, 1);

        setTimeout(() => {
            light.color.value = 'blue';
        }, 2);

        setTimeout(() => {
            assert.strictEqual(flag, 3);
        }, 10);
    }, 1);
});
