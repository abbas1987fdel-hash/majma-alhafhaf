import { useState, type SyntheticEvent } from 'react';
import { useCloud, friendlyError } from './cloud';
import { normalizePin } from '@/lib/preferences';

export function SyncStatus() {
  const prefs = useCloud();
  const [pin, setPin] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError('');
    try { await action(); setPin(''); setConfirm(false); } catch (failure) { setError(friendlyError(failure)); } finally { setBusy(false); }
  }
  function reconnect(event: SyntheticEvent<HTMLFormElement>) { event.preventDefault(); void run(() => prefs.reconnect(normalizePin(pin))); }
  if (!prefs.pending && !prefs.syncError && !prefs.needsLogin && !prefs.inventoryNeedsLogin && !prefs.inventoryUnchecked && prefs.connected) return null;
  return <section className="sync-status" aria-live="polite">
    {!prefs.connected && <p>وضع الأوفلاين: التعديلات محفوظة على هذا الجهاز. {prefs.lastSaved && <>آخر حفظ: {new Date(prefs.lastSaved).toLocaleString('ar-IQ')}</>}</p>}
    {!!prefs.pending && <p>{prefs.pending} تعديلات بانتظار الإرسال. افتح المخزون لمزامنة تعديلاته أيضًا.</p>}
    {prefs.inventoryUnchecked && <p>افتح المخزون للتحقق من وجود تعديلات محفوظة بانتظار المزامنة.</p>}
    {prefs.needsLogin && <form onSubmit={reconnect}><p>أعد إدخال رمز الدخول لإكمال المزامنة؛ تعديلاتك محفوظة.</p><label>رمز الدخول<input type="password" inputMode="numeric" autoComplete="off" required maxLength={8} value={pin} onChange={event => setPin(event.target.value)} /></label><button className="soft" disabled={busy} type="submit">اتصال ومزامنة</button></form>}
    {prefs.inventoryNeedsLogin && <form onSubmit={event => { event.preventDefault(); void run(() => prefs.reconnectInventory(pin)); }}><p>أدخل كلمة سر المخزون الحالية لمزامنة نسخته المحفوظة.</p><label>كلمة سر المخزون<input type="password" autoComplete="off" required maxLength={64} value={pin} onChange={event => setPin(event.target.value)} /></label><button className="soft" disabled={busy} type="submit">مزامنة المخزون</button></form>}
    {prefs.syncError && <><p role="alert">لم تكتمل المزامنة: {prefs.syncError}</p><p>لن نستبدل بيانات الجهاز بتعديلات جهاز آخر تلقائيًا. يمكنك إعادة المحاولة أو تنزيل نسخة للمراجعة.</p><div className="sync-actions"><button className="soft" disabled={busy || prefs.syncBusy} onClick={() => void run(prefs.retrySync)}>إعادة المحاولة</button><button className="soft" onClick={prefs.exportPending}>تنزيل نسخة التعديلات</button><button className="soft" disabled={!prefs.connected || !prefs.canDiscard} onClick={() => setConfirm(true)}>اعتماد بيانات الخادم</button></div></>}
    {confirm && <div role="alert"><p>سيتم تنزيل نسخة من التعديلات المحلية ثم إلغاء التعديلات التي تنتظر الإرسال واعتماد بيانات الخادم. لن تُحذف بيانات من قاعدة البيانات.</p><button className="delete-btn" disabled={busy} onClick={() => void run(prefs.discardPending)}>تنزيل النسخة واعتماد الخادم</button><button className="soft" onClick={() => setConfirm(false)}>إلغاء</button></div>}
    {error && <p role="alert" className="error">{error}</p>}
  </section>;
}
