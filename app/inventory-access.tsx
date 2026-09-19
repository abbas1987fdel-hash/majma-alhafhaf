'use client';
import { useState, type SyntheticEvent } from 'react';
import { LockKeyhole, Package, KeyRound } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { friendlyError } from './cloud';

export function InventoryGate({ unlock, unlockLocal, cancel, connected }: { unlock: (password: string) => Promise<void>; unlockLocal: (password: string) => Promise<void>; cancel: () => void; connected: boolean }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !connected) return;
    setBusy(true); setError('');
    try { await unlock(password); setPassword(''); }
    catch (failure) { setError(friendlyError(failure)); }
    finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) cancel(); }}>
    <DialogContent dir="rtl" className="inventory-gate">
      <span className="inventory-lock-icon"><Package size={30} /><LockKeyhole size={16} /></span>
      <DialogTitle>دخول المخزون</DialogTitle>
      <DialogDescription>أدخل كلمة سر المخزون لعرض المواد والأسعار والكميات.</DialogDescription>
      <form className="edit-form" onSubmit={submit}>
        <label>كلمة سر المخزون<input type="password" autoComplete="off" required maxLength={64} value={password} onChange={e => setPassword(e.target.value)} disabled={busy} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        {error && <button className="soft" type="button" disabled={busy} onClick={async () => { setBusy(true); try { await unlockLocal(password); } catch (failure) { setError(friendlyError(failure)); } finally { setBusy(false); } }}>فتح نسخة المخزون المحفوظة بكلمتها السابقة</button>}
        {!connected && <p className="error" role="alert">بانتظار الاتصال بالإنترنت.</p>}
        <button className="primary save" disabled={busy || !connected} type="submit"><LockKeyhole size={18} />{busy ? 'جارٍ التحقق…' : 'فتح المخزون'}</button>
        <button className="soft save" type="button" disabled={busy} onClick={cancel}>إلغاء</button>
      </form>
    </DialogContent>
  </Dialog>;
}

export function InventoryPasswordSettings({ changePassword, connected }: { changePassword: (oldPassword: string, newPassword: string, confirmation: string) => Promise<void>; connected: boolean }) {
  const [open, setOpen] = useState(false), [old, setOld] = useState(''), [next, setNext] = useState(''), [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !connected) return;
    setError(''); setMessage('');
    if (next.length < 4 || next.length > 64) { setError('كلمة السر الجديدة يجب أن تتكوّن من 4 إلى 64 حرفًا أو رقمًا.'); return; }
    if (next !== confirm) { setError('تأكيد كلمة السر غير مطابق.'); return; }
    setBusy(true);
    try { await changePassword(old, next, confirm); setOld(''); setNext(''); setConfirm(''); setMessage('تم تغيير كلمة سر المخزون.'); }
    catch (failure) { setError(friendlyError(failure)); }
    finally { setBusy(false); }
  }
  return <section className="settings-card">
    <h3><Package size={20} /> حماية المخزون</h3>
    <button className="soft save" type="button" aria-expanded={open} onClick={() => { setOpen(!open); setOld(''); setNext(''); setConfirm(''); setError(''); setMessage(''); }} disabled={busy}><KeyRound size={18} /> تغيير كلمة سر المخزن</button>
    {open && <form onSubmit={submit} className="inventory-password-form">
      <label>كلمة السر القديمة<input type="password" autoComplete="off" required maxLength={64} value={old} onChange={e => setOld(e.target.value)} /></label>
      <label>كلمة السر الجديدة<input type="password" autoComplete="new-password" required minLength={4} maxLength={64} value={next} onChange={e => setNext(e.target.value)} /></label>
      <label>تأكيد كلمة السر<input type="password" autoComplete="new-password" required maxLength={64} value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <output className="settings-result">{message}</output>}
      <button className="primary save" type="submit" disabled={busy || !connected}>{busy ? 'جارٍ الحفظ…' : 'حفظ كلمة سر المخزون'}</button>
    </form>}
  </section>;
}
