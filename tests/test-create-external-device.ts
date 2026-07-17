import { describe, test } from 'node:test';
import assert from 'assert';
import { Device, State, createExternalDevice, type ExternalDeviceDef } from '../index.js';

@Device()
class ExternalCounter implements ExternalDeviceDef {
    @State({
        persistentKeyGetter: function (this: ExternalCounter, entityIds) {
            this.persistenceEntityIds = entityIds;
            return `external-counter:${this.id}`;
        }
    })
    count = 0;

    persistenceEntityIds: Record<string, string>;

    constructor(readonly id: string) {}
}

describe('外部设备', () => {
    test('注册后支持 State 持久化', () => {
        const id = `persistence-${Date.now()}`;
        const firstCounter = createExternalDevice(ExternalCounter, id);
        assert.deepStrictEqual(firstCounter.persistenceEntityIds, {});
        firstCounter.count = 2;

        const secondCounter = createExternalDevice(ExternalCounter, id);
        assert.strictEqual(secondCounter.count, 2);
    });
});
