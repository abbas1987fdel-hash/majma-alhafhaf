export function increasedPrice(price: number, percent: number) {
  if (!Number.isFinite(percent) || percent < 0 || percent > 10000)
    throw Error('النسبة يجب أن تكون بين 0 و10000');
  const result = Math.round(price * (1 + percent / 100));
  if (!Number.isSafeInteger(result) || result < 0 || result > 1_000_000_000_000)
    throw Error('السعر الناتج يتجاوز الحد المسموح');
  return result;
}

export function decreasedPrice(price: number, percent: number) {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100)
    throw Error('نسبة التخفيض يجب أن تكون بين 0 و100');
  const result = Math.round(price * (1 - percent / 100));
  if (!Number.isSafeInteger(result) || result < 0 || result > 1_000_000_000_000)
    throw Error('السعر الناتج غير صالح');
  return result;
}
