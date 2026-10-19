import {test} from 'node:test'
import assert from 'node:assert/strict'
import {beamProfile, normalizeAttractors, validateCapacity} from '../src/model.ts'

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

test('beam identities are independent, bounded and survive record edits', () => {
    const records = normalizeAttractors(['http', 'mcp', 'smtp'].map(id => ({id, label:id})), 16)
    const profiles = records.map(record => beamProfile(record.id))
    assert.equal(new Set(profiles.map(profile => JSON.stringify(profile))).size, 3)
    const edited = normalizeAttractors(records.map(record => ({...record, label:'Renamed', x:.2})).reverse(), 16)
    assert.deepEqual(edited.map(record => beamProfile(record.id)).reverse(), profiles)
    for (const profile of profiles) {
        assert.ok(profile.beamPhase >= 0 && profile.beamPhase < Math.PI * 2)
        assert.ok(profile.beamRate >= .25 && profile.beamRate <= .6)
        assert.ok(profile.beamWidth >= .45 && profile.beamWidth <= 1.65)
        assert.ok(Math.abs(profile.beamBend) <= .35)
        assert.ok(profile.beamCurl >= .4 && profile.beamCurl <= 1.6)
    }
})
