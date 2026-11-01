import { ConvexError } from 'convex/values';
import { useState } from 'react';
import { useCloud, friendlyError } from './cloud';
import { increasedPrice, decreasedPrice } from '../lib/price-adjustment';
export function BulkPrices() {
  return (
    <>
      <PriceForm />
      <PriceForm decrease />
    </>
  );
}
function PriceForm({ decrease = false }: { decrease?: boolean }) {
  const label = decrease ? 'تخفيض' : 'زيادة';
  const calculate = decrease ? decreasedPrice : increasedPrice;
  const cloud = useCloud();
  const products = cloud.inventory?.products ?? [];
  const [buy, setBuy] = useState(''),
    [sell, setSell] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState<
    Parameters<typeof cloud.increasePrices>[0] | null
  >(null);
  const bp = Number(buy),
    sp = Number(sell);
  let error = '';
  try {
    for (const p of products) {
      calculate(p.buy, bp);
      calculate(p.sell, sp);
    }
  } catch (e) {
    error = (e as Error).message;
  }
  const allowed =
    cloud.connected &&
    cloud.canWrite &&
    !cloud.pending &&
    !cloud.inventoryNeedsLogin &&
    !cloud.inventoryUnchecked;
  async function apply() {
    if (busy || !allowed || error || (!bp && !sp)) return;
    if (
      !confirm(
        'تأكيد ' +
          label +
          ' أسعار ' +
          products.length +
          ' مادة؟ الشراء ' +
          bp +
          '٪ والبيع ' +
          sp +
          '٪. التعديل على الأسعار الحالية، والفواتير السابقة لا تتغير.',
      )
    )
      return;
    setBusy(true);
    setMessage('');
    try {
      const request = attempt ?? {
        decrease,
        buyPercent: bp,
        sellPercent: sp,
        operationId: crypto.randomUUID(),
        expected: products.map((p) => ({ id: p.id, version: p.version })),
      };
      setAttempt(request);
      await cloud.increasePrices(request);
      setAttempt(null);
      setBuy('');
      setSell('');
      setMessage('تم تحديث أسعار المخزون.');
    } catch (e) {
      if (e instanceof ConvexError) setAttempt(null);
      setMessage(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="settings-card"
      aria-label={label + ' أسعار المخزون'}
      style={{ marginBottom: 20 }}
    >
      <h3>{label} أسعار جميع المواد (%)</h3>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <label style={{ flex: '1 1 160px' }}>
          {label} سعر البيع (%)
          <input
            aria-label={'نسبة ' + label + ' سعر البيع'}
            type="number"
            min="0"
            max={decrease ? 100 : 10000}
            step="any"
            value={sell}
            disabled={busy || !!attempt}
            onChange={(e) => setSell(e.target.value)}
            placeholder="مثلاً 20"
            style={{ width: '100%' }}
          />
        </label>
        <label style={{ flex: '1 1 160px' }}>
          {label} سعر الشراء (%)
          <input
            aria-label={'نسبة ' + label + ' سعر الشراء'}
            type="number"
            min="0"
            max={decrease ? 100 : 10000}
            step="any"
            value={buy}
            disabled={busy || !!attempt}
            onChange={(e) => setBuy(e.target.value)}
            placeholder="مثلاً 10"
            style={{ width: '100%' }}
          />
        </label>
      </div>
      <p>
        كل رقم نسبة مئوية. الحقل الفارغ لا يغير السعر. تُقرّب النتيجة لأقرب دينار.
      </p>
      {!!products.length && !error && !!(bp || sp) && (
        <p>
          معاينة «{products[0].name}»: البيع{' '}
          {products[0].sell.toLocaleString('ar-IQ')} ←{' '}
          {calculate(products[0].sell, sp).toLocaleString('ar-IQ')} د.ع، الشراء{' '}
          {products[0].buy.toLocaleString('ar-IQ')} ←{' '}
          {calculate(products[0].buy, bp).toLocaleString('ar-IQ')} د.ع
        </p>
      )}
      {!allowed && <p>يلزم اتصال ومزامنة مكتملة لتطبيق التعديل.</p>}
      <button
        className="primary"
        disabled={
          busy || !allowed || !!error || !(bp || sp) || !products.length
        }
        onClick={() => void apply()}
      >
        {busy
          ? 'جارٍ تطبيق ' + label + '…'
          : 'تطبيق ' + label + ' على جميع المواد'}
      </button>
      {(message || error) && <output>{error || message}</output>}
    </section>
  );
}
