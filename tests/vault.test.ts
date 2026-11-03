// Encrypted vault: create / lock / unlock / throttle / tamper detection.
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
import * as V from '../src/utils/vault.ts';

const ok = (c: boolean, m: string) => {
  console.log((c ? 'PASS' : 'FAIL') + ' - ' + m);
  if (!c) process.exitCode = 1;
};

ok(!V.isVaultSetUp(), 'no vault initially');
let threw = false;
try {
  await V.createVault('short', '{}');
} catch {
  threw = true;
}
ok(threw, 'rejects a short passphrase');
await V.createVault('correct horse battery', '{"bookmarks":[1],"history":[]}');
ok(V.isVaultSetUp() && V.isVaultUnlocked(), 'created and unlocked');
ok(!store.get('aegis_vault_data')!.includes('bookmarks'), 'stored data is not plaintext');
ok(![...store.values()].some((v) => v.includes('correct horse')), 'passphrase is not stored anywhere');
await V.saveVaultData('{"bookmarks":[1,2],"history":[]}');
V.lockVault();
ok(!V.isVaultUnlocked(), 'locking drops the key from memory');
let loadFailed = false;
try {
  await V.loadVaultData();
} catch {
  loadFailed = true;
}
ok(loadFailed, 'data cannot be read while locked');
let r = await V.unlockVault('wrong1');
ok(!r.ok && r.reason === 'wrong', 'wrong passphrase rejected');
r = await V.unlockVault('wrong2');
ok(!r.ok && r.reason === 'wrong', 'second wrong passphrase rejected');
r = await V.unlockVault('wrong3');
ok(!r.ok && r.reason === 'locked-out' && (r.retryAfterMs ?? 0) > 0, 'third wrong attempt starts a delay');
r = await V.unlockVault('correct horse battery');
ok(!r.ok && r.reason === 'locked-out', 'even the right passphrase waits during the delay');
store.set('aegis_vault_fails', JSON.stringify({ count: 3, until: 0 }));
r = await V.unlockVault('correct horse battery');
ok(r.ok, 'right passphrase unlocks after the delay');
ok((await V.loadVaultData()) === '{"bookmarks":[1,2],"history":[]}', 'data round-trips');
const d = store.get('aegis_vault_data')!;
store.set('aegis_vault_data', d.slice(0, -4) + (d.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA'));
let tampered = false;
try {
  await V.loadVaultData();
} catch {
  tampered = true;
}
ok(tampered, 'tampered ciphertext is detected');
V.destroyVault();
ok(!V.isVaultSetUp() && store.size === 0, 'destroy removes everything');
