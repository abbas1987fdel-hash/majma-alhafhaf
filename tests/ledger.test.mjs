import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  money,
  total,
  balance,
  validLedger,
  normalize,
  phoneNumber,
} from '../lib/ledger.ts';
const d = {
  id: 'd',
  customer: 'a',
  type: 'debt',
  items: [
    { name: 'حنفية', price: 2000 },
    { name: 'أنبوب', price: 3000 },
  ],
  amount: 5000,
  date: '2026-09-08',
};
const p = { ...d, id: 'p', type: 'payment', items: [], amount: 2000 };
test('multiple lines, thousands and Arabic input', () => {
  assert.equal(total(d.items), 5000);
  assert.equal(money(2000), '2,000');
  assert.equal(normalize('أَحمد'), 'احمد');
  assert.equal(normalize('٢٬٠٠٠'), '2٬000');
});
test('partial payment and edit/delete constraints', () => {
  assert.equal(balance([d, p]), 3000);
  assert.equal(validLedger([d, p]), true);
  assert.equal(validLedger([{ ...d, amount: 1000 }, p]), false);
  assert.equal(validLedger([p]), false);
  assert.equal(balance([d]), 5000);
  assert.equal(validLedger([d, { ...p, amount: 5000 }]), true);
  assert.equal(validLedger([d, { ...p, amount: 5001 }]), false);
  assert.equal(validLedger([d, { ...p, amount: -5 }]), false);
});
test('cannot fund old payment with later debt', () =>
  assert.equal(validLedger([p, d]), false));
test('WhatsApp Iraqi normalization and invalid input', () => {
  assert.equal(phoneNumber('٠٧٧٠١٢٣٤٥٦٧'), '9647701234567');
  assert.equal(phoneNumber('+964 770 123 4567'), '9647701234567');
  assert.equal(phoneNumber('abc'), '');
  assert.equal(phoneNumber('123'), '');
});

import { overdueDebts, dueAfter, dateKey } from '../lib/ledger.ts';
test('due date uses Baghdad day and month rollover', () => {
  assert.equal(dateKey('2026-09-08T22:00:00Z'), '2026-09-09');
  assert.equal(dueAfter('2026-01-31T12:00:00Z'), '2026-03-02');
});
test('only unpaid debt past due day triggers delay', () => {
  const old = { ...d, dueDate: '2026-09-01' };
  const now = Date.parse('2026-09-08T12:00:00Z');
  assert.deepEqual(overdueDebts([old, p], now), [
    { id: 'd', remaining: 3000, dueDate: '2026-09-01' },
  ]);
  assert.equal(overdueDebts([old, { ...p, amount: 5000 }], now).length, 0);
  assert.equal(
    overdueDebts([{ ...old, dueDate: '2026-09-08' }], now).length,
    0,
  );
  assert.equal(
    overdueDebts([{ ...old, dueDate: '2026-09-09' }], now).length,
    0,
  );
});
test('oldest debt settles before newer debt; edit and deletion recompute overdue', () => {
  const now = Date.parse('2026-09-08T12:00:00Z');
  const a = { ...d, dueDate: '2026-09-01' },
    b = { ...d, id: 'b', amount: 2000, dueDate: '2026-09-20' };
  assert.equal(overdueDebts([a, b, { ...p, amount: 5000 }], now).length, 0);
  assert.equal(overdueDebts([a, b, p], now)[0].remaining, 3000);
  assert.equal(overdueDebts([a, b], now)[0].remaining, 5000);
  assert.equal(
    overdueDebts([{ ...a, dueDate: '2026-09-20' }, p], now).length,
    0,
  );
});
import { matchesName } from '../lib/ledger.ts';
test('customer search matches first, father and grandfather names', () => {
  for (const q of ['ع', 'ح', 'ي', 'حسن', 'ياس', 'علي حسن', 'حسن يا'])
    assert.equal(matchesName('علي حسن ياسر', q), true, q);
  assert.equal(matchesName('علي حسن ياسر', 'سن'), false);
  assert.equal(matchesName('علي حسن ياسر', 'ز'), false);
  assert.equal(matchesName('علي حسن ياسر', ''), true);
});
test('inventory search matches any word and preserves Arabic normalization', () => {
  assert.equal(matchesName('حنفية ماء نحاس', 'م'), true);
  assert.equal(matchesName('حنفية ماء نحاس', 'نح'), true);
  assert.equal(matchesName('حنفية ماء نحاس', 'ماء نح'), true);
  assert.equal(matchesName('أنبوب   ماء', '  ان  '), true);
  assert.equal(matchesName('عَلِي حسن ياسر', 'علي'), true);
  assert.equal(matchesName('حنفية ماء نحاس', 'حديد'), false);
});
