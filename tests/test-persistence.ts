import { describe } from 'node:test';
import assert from 'assert';
import { Device, DeviceDef, HAEvent, State, createDevice, ref } from '../index.js';
import { localStorage } from '../src/utils/local-storage.js';

localStorage.clear();

describe('Ref值持久化', () => {
    ref('abc').asPersistent('str');
    ref(123).asPersistent('num');
    ref(true).asPersistent('bool');
    ref(null).asPersistent('null');
    ref([1, '2', true, false, { a: [1, '2', true, false], b: 'b' }]).asPersistent('arr');

    ref('aaa').asPersistent('str0');

    setTimeout(() => {
        const str1 = ref().asPersistent('str');
        const num1 = ref().asPersistent('num');
        const bool1 = ref().asPersistent('bool');
        const arr1 = ref().asPersistent('arr');
        const null1 = ref().asPersistent('null');

        setTimeout(() => {
            const str2 = ref('bbb').asPersistent('str0');

            assert.strictEqual(str1.value, 'abc');
            assert.strictEqual(num1.value, 123);
            assert.strictEqual(bool1.value, true);
            assert.strictEqual(null1.value, null);
            assert.deepStrictEqual(arr1.value, [1, '2', true, false, { a: [1, '2', true, false], b: 'b' }]);

            assert.strictEqual(str2.value, 'aaa');
        }, 200);
    }, 100);
});

describe('State值持久化', () => {
    @Device()
    class TestLocalStorage implements DeviceDef {
        $entityIds: { test: string };

        $onEvent(haEvent: HAEvent<any, any>, entityId: string): void {
            throw new Error('Method not implemented.');
        }

        @State({ persistentKeyGetter: () => 's1' })
        s1: string;

        @State({ persistentKeyGetter: () => 's2' })
        s2: number;

        @State({ persistentKeyGetter: () => 's3' })
        s3: boolean;

        @State({ persistentKeyGetter: () => 's4' })
        s4: any = null;

        @State({ persistentKeyGetter: () => 's5' })
        s5 = 's5';

        @State({ persistentKeyGetter: () => 's6' })
        s6 = { a: 1, b: false, c: ['cccc'] };

        @State({ persistentKeyGetter: () => 's7' })
        s7: string;
    }

    const testLocalStorage1 = createDevice(TestLocalStorage, { test: 'test1' });

    testLocalStorage1.s1 = 's1';
    testLocalStorage1.s2 = 2;
    testLocalStorage1.s3 = false;

    const testLocalStorage2 = createDevice(TestLocalStorage, { test: 'test2' });

    assert.strictEqual(testLocalStorage2.s1, 's1');
    assert.strictEqual(testLocalStorage2.s2, 2);
    assert.strictEqual(testLocalStorage2.s3, false);
    assert.strictEqual(testLocalStorage2.s4, null);
    assert.strictEqual(testLocalStorage2.s5, 's5');
    assert.deepStrictEqual(testLocalStorage2.s6, { a: 1, b: false, c: ['cccc'] });
    assert.strictEqual(testLocalStorage2.s7, undefined);

    setTimeout(() => {
        testLocalStorage1.s2 = 3;
        const testLocalStorage3 = createDevice(TestLocalStorage, { test: 'test3' });
        assert.strictEqual(testLocalStorage3.s2, 3);
    }, 100);

    setTimeout(() => {
        testLocalStorage1.s2 = null;
        const testLocalStorage4 = createDevice(TestLocalStorage, { test: 'test4' });
        assert.strictEqual(testLocalStorage4.s2, null);
    }, 200);

    setTimeout(() => {
        testLocalStorage1.s2 = undefined;
        const testLocalStorage5 = createDevice(TestLocalStorage, { test: 'test5' });
        assert.strictEqual(testLocalStorage5.s2, undefined);
    }, 300);
});
