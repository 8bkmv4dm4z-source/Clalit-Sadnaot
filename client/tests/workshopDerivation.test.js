import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveWorkshopsByEntity } from '../src/utils/workshopDerivation.js';

test('deriveWorkshopsByEntity derives parent and family workshops', () => {
  const displayedWorkshops = [
    { _id: 'w1', title: 'A' },
    { _id: 'w2', title: 'B' },
  ];

  const userWorkshopMap = { w1: true };
  const familyWorkshopMap = { w2: ['f1'] };

  const out = deriveWorkshopsByEntity({
    displayedWorkshops,
    userWorkshopMap,
    familyWorkshopMap,
    userEntity: { entityKey: 'u1', name: 'Parent' },
    user: { entityKey: 'u1' },
    familyMembers: [{ entityKey: 'f1', name: 'Child', isFamily: true }],
    allEntities: [],
  });

  assert.equal(out.u1.workshops.length, 1);
  assert.equal(out.f1.workshops.length, 1);
  assert.equal(out.f1.workshops[0]._id, 'w2');
});
