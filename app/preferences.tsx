'use client';
import BrandImage from './brand-image';
import { InventoryPasswordSettings } from './inventory-access';
import { useCloud, friendlyError } from './cloud';
import { useEffect, useState, useSyncExternalStore, type SyntheticEvent } from 'react';
import { installation } from '@/lib/install';
import {
  Download,
  LockKeyhole,
  ArrowLeft,
  Check,
  ImagePlus,
  LogOut,
} from 'lucide-react';
import {
  normalizePin,
  validPin,
} from '@/lib/preferences';
export const defaultLogo = () => `${import.meta.env.BASE_URL}brand.png`;
const noInstall = { available: false, installed: false, busy: false };
export function InstallApp() {
  const status = useSyncExternalStore(installation?.subscribe ?? (() => () => {}), installation?.getSnapshot ?? (() => noInstall), () => noInstall);
  const [message, setMessage] = useState('');
  async function install() {
    try {
      const result = await installation?.install();
      if (result === 'accepted') setMessage('تم قبول طلب التثبيت. أكمل خطوات المتصفح إن ظهرت.');
      else if (result === 'dismissed') setMessage('تم إلغاء طلب التثبيت. يمكنك تثبيته لاحقًا من قائمة المتصفح.');
      else if (result === 'installed') setMessage('التطبيق يعمل الآن بوضع التطبيق المثبّت.');
      else if (result !== 'busy') setMessage('المتصفح لم يوفّر نافذة التثبيت هنا. افتح الرابط في Edge، ثم من القائمة ⋯ اختر التطبيقات ← تثبيت هذا الموقع كتطبيق. على iPhone استخدم Safari ← مشاركة ← إضافة إلى الشاشة الرئيسية. إن كان التطبيق مثبتًا افتحه من أيقونته.');
    } catch {
      setMessage('تعذّر فتح طلب التثبيت. افتح الرابط في Edge وثبّته من قائمة التطبيقات.');
    }
  }
  return (
    <div className="install-app">
      <button
        type="button"
        className="soft save"
        disabled={status.busy || status.installed}
        onClick={() => void install()}
      >
        <Download size={18} /> {status.installed ? 'التطبيق مثبّت' : status.busy ? 'جارٍ فتح نافذة التثبيت…' : 'تثبيت التطبيق'}
      </button>
      {message && <output className="install-help" style={{ display: 'block' }}>{message}</output>}
    </div>
  );
}
export function Welcome({ name, logo, onEnter, onLocal }: {
  name: string; logo: string; onEnter: (pin: string) => Promise<void>; onLocal: (pin: string) => Promise<void>;
}) {
  const [pin, setPin] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function enter(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setError('');
    if (!validPin(pin)) { setError('أدخل رمز الدخول'); return; }
    setBusy(true);
    try { await onEnter(normalizePin(pin)); setPin(''); }
    catch (error) { setError(friendlyError(error)); }
    finally { setBusy(false); }
  }
  return <main className="welcome"><section className="welcome-card">
    <div className="welcome-photo"><BrandImage src={logo} alt={name} />
      <div className="welcome-overlay"><span>أهلًا وسهلًا بك</span><h1>{name}</h1><p>الزبائن والمخزون والحسابات، في مكان واحد.</p></div>
    </div>
    <div className="welcome-content"><span className="welcome-lock"><LockKeyhole size={22} /></span>
      <h2>مرحبًا بعودتك</h2><p>أدخل رمزك لفتح الحسابات.</p>
      <form onSubmit={enter}><label>رمز الدخول<input type="password" inputMode="numeric" autoComplete="off" maxLength={8} required value={pin} onChange={e => setPin(e.target.value)} /></label>
        {error && <p role="alert" className="error">{error}</p>}
        <button disabled={busy} className="primary save" type="submit">{busy ? 'جارٍ الفتح…' : 'دخول التطبيق'}<ArrowLeft size={19} /></button>
        {error && <><button disabled={busy} className="soft save" type="button" onClick={async () => { setBusy(true); try { await onLocal(normalizePin(pin)); } catch (failure) { setError(friendlyError(failure)); } finally { setBusy(false); } }}>فتح النسخة المحفوظة</button><p className="settings-hint">إذا تغير الرمز من جهاز آخر: أدخل رمز هذه النسخة القديم وافتحها، ثم أدخل الرمز الجديد في طلب المزامنة.</p></>}
      </form><InstallApp /><p className="session-note">بعد أول دخول بالإنترنت تُحفظ نسخة مشفّرة على هذا الجهاز للعمل بدون إنترنت. افتح المخزون مرة متصلًا لتجهيزه أيضًا. لا تمسح بيانات المتصفح قبل اكتمال المزامنة.</p>
    </div>
  </section></main>;
}
export function useAppPreferences() { return useCloud(); }
type Prefs = ReturnType<typeof useAppPreferences>;
export function SettingsPanel({ prefs }: { prefs: Prefs }) {
  const [name, setName] = useState(prefs.name),
    [intro, setIntro] = useState(prefs.intro),
    [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(prefs.logo),
    [current, setCurrent] = useState(''),
    [next, setNext] = useState(''),
    [repeat, setRepeat] = useState(''),
    [message, setMessage] = useState(''),
    [pinMessage, setPinMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [saving, setSaving] = useState(false);
  useEffect(
    () => () => {
      if (preview.startsWith('blob:') && preview !== prefs.logo)
        URL.revokeObjectURL(preview);
    },
    [preview, prefs.logo],
  );
  function chooseLogo(selected?: File) {
    if (!selected) return;
    if (
      !['image/png', 'image/jpeg', 'image/webp'].includes(selected.type) ||
      selected.size > 5 * 1024 * 1024
    ) {
      setMessage('اختر صورة PNG أو JPG أو WebP بحجم أقل من 5 ميغابايت');
      return;
    }
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
    setMessage('');
  }
  async function saveBrand(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) {
      setMessage('اكتب اسم التطبيق');
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      await prefs.saveSettings(name.trim(), intro.trim(), file);
      setFile(null);
      setMessage('تم حفظ الإعدادات');
    } catch (error) { setMessage(friendlyError(error)); }
    finally { setSaving(false); }
  }
  async function changePin(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setPinMessage('');
    if (!validPin(next)) {
      setPinMessage('الرمز الجديد يجب أن يتكوّن من 4 إلى 8 أرقام');
      return;
    }
    if (normalizePin(next) !== normalizePin(repeat)) {
      setPinMessage('تأكيد الرمز غير مطابق');
      return;
    }
    setBusy(true);
    try {
      await prefs.changePin(normalizePin(current), normalizePin(next));
      setCurrent('');
      setNext('');
      setRepeat('');
      setPinMessage('تم تغيير رمز الدخول');
    } catch (error) { setPinMessage(friendlyError(error)); } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>الإعدادات</h2>
          <p>هوية التطبيق ورمز الدخول ورسائل واتساب</p>
        </div>
      </div>
      <section className="settings-card">
        <h3>
          <ImagePlus size={20} /> اسم التطبيق والشعار
        </h3>
        <form onSubmit={saveBrand}>
          <div className="logo-preview">
            <BrandImage src={preview} alt="معاينة الشعار" />
          </div>
          <label>
            تغيير الشعار
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => chooseLogo(e.target.files?.[0])}
            />
          </label>
          <label>
            اسم التطبيق
            <input
              required
              maxLength={70}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            مقدمة رسالة واتساب
            <textarea
              maxLength={500}
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              placeholder="اكتب الرسالة التي تسبق تفاصيل الحساب"
            />
          </label>
          <div className="message-preview">
            <strong>معاينة بداية الرسالة</strong>
            <p>
              {name}
              {'\n'}
              {intro}
            </p>
            <small>تليها بيانات الزبون والمعاملة والدين المتبقي.</small>
          </div>
          <p className="settings-hint">
            الاسم والمقدمة يرافقان الرسالة. على الهواتف الداعمة تُفتح المشاركة مع
            صورة الشعار لتختار واتساب؛ وإلا تُفتح رسالة واتساب نصية.
          </p>
          <button disabled={saving || !prefs.connected} className="primary save" type="submit">
            <Check size={18} /> حفظ الإعدادات
          </button>
          {message && <output className="settings-result">{message}</output>}
        </form>
      </section>
      <section className="settings-card">
        <h3>
          <LockKeyhole size={20} /> تغيير رمز الدخول
        </h3>
        <form onSubmit={changePin}>
          <label>
            الرمز الحالي
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              required
              maxLength={8}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </label>
          <label>
            الرمز الجديد
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              required
              maxLength={8}
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </label>
          <label>
            تأكيد الرمز الجديد
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              required
              maxLength={8}
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
            />
          </label>
          <button disabled={busy || !prefs.connected} className="primary save" type="submit">
            تغيير الرمز
          </button>
          {pinMessage && (
            <output className="settings-result">{pinMessage}</output>
          )}
        </form>
        <p className="settings-hint">
          تغيير الرمز يغلق الجلسات الأخرى. احتفظ بالرمز الجديد في مكان آمن.
        </p>
        <button className="soft save" disabled={prefs.syncBusy} onClick={() => void prefs.lock().catch(failure => setPinMessage(friendlyError(failure)))}>
          <LogOut size={18} /> قفل التطبيق
        </button>
      </section>
      <InventoryPasswordSettings changePassword={prefs.changeInventoryPassword} connected={prefs.connected} />
      <section className="settings-card">
        <h3>التطبيق على هاتفك</h3>
        <InstallApp />
        <p className="settings-hint">
          اسم وأيقونة التطبيق المثبّت ثابتان لهذه النسخة. تغيير الاسم والشعار أعلاه
          يخص الواجهة ورسالة المشاركة.
        </p>
      </section>
    </>
  );
}
