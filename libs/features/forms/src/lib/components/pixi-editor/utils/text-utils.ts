type NumericWeightString =
  | '100'
  | '200'
  | '300'
  | '400'
  | '500'
  | '600'
  | '700'
  | '800'
  | '900';
type FontWeightKeyword = 'normal' | 'bold' | 'bolder' | 'lighter';
export type FontWeightValue = NumericWeightString | FontWeightKeyword;

export const normalizeFontWeight = (w: string): FontWeightValue => {
  const s = String(w).trim().toLowerCase();
  if (s === 'normal' || s === 'bold' || s === 'bolder' || s === 'lighter')
    return s as FontWeightKeyword;
  const n = Number(s);
  const allowed: NumericWeightString[] = [
    '100',
    '200',
    '300',
    '400',
    '500',
    '600',
    '700',
    '800',
    '900',
  ];
  const nearest = Number.isFinite(n)
    ? (String(
        Math.min(900, Math.max(100, Math.round(n / 100) * 100))
      ) as NumericWeightString)
    : '400';
  return allowed.includes(nearest as NumericWeightString)
    ? (nearest as NumericWeightString)
    : '400';
};
