import {test} from 'node:test'
import assert from 'node:assert/strict'
import {normalizeAttractors, validateCapacity} from '../src/model.ts'

test('identity survives rename/reorder; input objects are never mutated', () => {
    const original = Object.freeze([{id: 'a', label: 'First'}, {id: 'b', label: 'Second', x: .8, y: .3}].map(Object.freeze))
    const placed = normalizeAttractors(original, 16)
    const reordered = normalizeAttractors([{...placed[1], label: 'Renamed'}, placed[0]], 16)
    assert.equal(reordered[0].id, 'b')
    assert.equal(reordered[0].label, 'Renamed')
    assert.equal(reordered[0].x, .8)
    assert.equal(original[1].label, 'Second')
})
test('capacity and invalid values fail instead of dropping or poisoning records', () => {
    assert.throws(() => validateCapacity(33), RangeError)
    assert.throws(() => validateCapacity(1.5), RangeError)
    assert.throws(() => normalizeAttractors([{id:'a',label:'A'},{id:'b',label:'B'}], 1), RangeError)
    assert.throws(() => normalizeAttractors([{id:'a',label:'A'},{id:'a',label:'B'}], 16), TypeError)
    assert.throws(() => normalizeAttractors([{id:'a',label:'A',x:NaN}], 16), RangeError)
    assert.throws(() => normalizeAttractors([{id:'a',label:'A',strength:2}], 16), RangeError)
    assert.throws(() => normalizeAttractors([{id:'a',label:' '}], 16), TypeError)
    assert.equal(normalizeAttractors([], 16).length, 0)
})
