export function convertMinorAmount(amount, fromCurrency, toCurrency, phpPerUsd) {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError('Price must be a non-negative integer amount in cents');
  if (!['PHP', 'USD'].includes(fromCurrency) || !['PHP', 'USD'].includes(toCurrency)) {
    throw new RangeError('Only PHP and USD are supported');
  }
  if (!Number.isFinite(phpPerUsd) || phpPerUsd <= 0) throw new RangeError('Exchange rate must be a positive number');
  if (fromCurrency === toCurrency) return amount;
  return fromCurrency === 'USD' ? Math.round(amount * phpPerUsd) : Math.round(amount / phpPerUsd);
}
