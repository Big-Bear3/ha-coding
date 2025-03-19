import { describe } from 'node:test';
import assert from 'assert';
import { ref } from '../index.js';

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

            assert.strictEqual(str2.value, 'bbb');
        }, 200);
    }, 100);
});
