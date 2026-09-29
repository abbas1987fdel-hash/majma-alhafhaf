import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const source = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
function boot(modules) {
  const message = { textContent: 'جارٍ فتح دفتر الديون…' };
  const retry = { hidden: true };
  const events = {};
  let timeout;
  vm.runInNewContext(source, {
    document: {
      createElement: () => modules ? { noModule: false } : {},
      getElementById: id => id === 'startup-message' ? message : retry,
    },
    window: {
      addEventListener: (name, handler) => { events[name] = handler; },
      removeEventListener: name => { delete events[name]; },
    },
    setTimeout: handler => { timeout = handler; return 1; },
    clearTimeout: () => { timeout = undefined; },
  });
  return { message, retry, events, get timeout() { return timeout; } };
}
test('non-module browser receives immediate browser guidance, not endless loading', () => {
  const page = boot(false);
  assert.match(page.message.textContent, /هذا المتصفح قديم/);
  assert.equal(page.timeout, undefined);
});
test('modern browser retains retry and successful startup cleanup', () => {
  const failed = boot(true);
  failed.timeout();
  assert.equal(failed.retry.hidden, false);
  const ready = boot(true);
  ready.events['hafhaf:ready']();
  assert.equal(ready.timeout, undefined);
  assert.equal(ready.events.error, undefined);
});
