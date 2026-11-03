// TEST HARNESS ONLY - never loaded in normal runs.
// Lets the real server.ts talk to local fake upstream sites: names ending in ".test" resolve to
// loopback and loopback is allowed past the SSRF IP block-list.
import dns from 'node:dns';
import net from 'node:net';

const original = dns.lookup;
dns.lookup = (host, opts, cb) => {
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }
  if (String(host).endsWith('.test')) {
    return opts && opts.all ? cb(null, [{ address: '127.0.0.1', family: 4 }]) : cb(null, '127.0.0.1', 4);
  }
  return original(host, opts, cb);
};
net.BlockList.prototype.check = () => false;
