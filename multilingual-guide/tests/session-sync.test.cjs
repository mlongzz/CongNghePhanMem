const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');

const { classifyStorageChange, tokenSubject } = loadTs('src/services/sessionRestore.ts', { globals: { atob } });
const plain = value => JSON.parse(JSON.stringify(value));
const jwt = sub => `h.${Buffer.from(JSON.stringify({ sub, exp: 9999999999 })).toString('base64url')}.s`;

test('token subject is read from the payload and is null for anything else', () => {
  assert.equal(tokenSubject(jwt('42')), '42');
  assert.equal(tokenSubject(jwt(7)), '7');
  for (const value of [null, undefined, '', 'abc', 'a.b.c', 'a.!!!.c']) assert.equal(tokenSubject(value), null, String(value));
});

test('storage changes from another tab are classified by what the account did', () => {
  const mine = jwt('1');
  const rotated = jwt('1') + 'x';
  const table = [
    ['signed in tab sees tokens removed', [mine, null, null], { kind: 'signed-out' }],
    ['signed out tab sees nothing', [null, null, null], { kind: 'ignore' }],
    ['signed out tab sees a new sign-in', [null, jwt('2'), 'r'], { kind: 'switched' }],
    ['same token is ignored', [mine, mine, 'r'], { kind: 'ignore' }],
    ['same account rotated tokens only update', [mine, rotated, 'r2'], { kind: 'rotated', access: rotated, refresh: 'r2' }],
    ['rotated access with refresh not yet written', [mine, rotated, null], { kind: 'rotated', access: rotated, refresh: '' }],
    ['different account signs the tab out and reloads', [mine, jwt('2'), 'r'], { kind: 'switched' }],
    ['unreadable new token is treated as a different account', [mine, 'opaque', 'r'], { kind: 'switched' }],
  ];
  for (const [name, args, expected] of table) assert.deepEqual(plain(classifyStorageChange(...args)), expected, name);
});
