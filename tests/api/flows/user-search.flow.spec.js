// @ts-check

// A flow written in code instead of JSON. Use code when a flow needs loops,
// conditions or calculations; use a .flow.json file for straightforward sequences.
// Either way, the requests come from the steps files in each method folder.

import { test, expect, newUser, unique } from '../support/fixtures';
import { postSteps } from '../post/users.post.steps';
import { getSteps } from '../get/users.get.steps';
import { deleteSteps } from '../delete/users.delete.steps';

test('Flow: created users can be searched, and disappear after delete', { tag: ['@flow', '@search'] }, async ({ api }) => {
  const marker = unique();
  /** @type {any[]} */
  const created = [];

  await test.step('1. POST create two users that share a name', async () => {
    for (const role of ['admin', 'tester']) {
      created.push(await postSteps['POST create user'](api, newUser({ name: `Searchable ${marker} ${role}`, role })));
    }
  });

  await test.step('2. GET search finds both users', async () => {
    const list = await getSteps['GET users list'](api, { search: marker });
    expect(list.total).toBe(2);
    expect(list.data.map((u) => u.id).sort()).toEqual(created.map((u) => u.id).sort());
  });

  await test.step('3. GET search with a role filter finds one user', async () => {
    const list = await getSteps['GET users list'](api, { search: marker, role: 'admin' });
    expect(list.total).toBe(1);
    expect(list.data[0].role).toBe('admin');
  });

  await test.step('4. DELETE both users', async () => {
    for (const user of created) await deleteSteps['DELETE user'](api, { id: user.id });
  });

  await test.step('5. GET search finds nothing', async () => {
    const list = await getSteps['GET users list'](api, { search: marker });
    expect(list.total).toBe(0);
  });
});
