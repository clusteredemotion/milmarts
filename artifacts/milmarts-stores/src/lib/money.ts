type ShopifyMoney = {
  amount: string;
  currencyCode: string;
};

type VisitorCurrency = {
  currencyCode: string;
  rates: Record<string, number>;
};

export function convertMoney(
  money: ShopifyMoney,
  visitorCurrency: VisitorCurrency,
): ShopifyMoney | null {
  const amount = Number(money.amount);
  if (!Number.isFinite(amount)) return null;

  const sourceCurrency = money.currencyCode.toUpperCase();
  const targetCurrency = visitorCurrency.currencyCode.toUpperCase();
  if (sourceCurrency === targetCurrency) {
    return { amount: money.amount, currencyCode: targetCurrency };
  }

  const sourceUnitsPerUsd = sourceCurrency === "USD" ? 1 : visitorCurrency.rates[sourceCurrency];
  const targetUnitsPerUsd = targetCurrency === "USD" ? 1 : visitorCurrency.rates[targetCurrency];
  if (
    !Number.isFinite(sourceUnitsPerUsd) ||
    !sourceUnitsPerUsd ||
    !Number.isFinite(targetUnitsPerUsd) ||
    !targetUnitsPerUsd
  ) {
    return null;
  }

  return {
    amount: (amount * (targetUnitsPerUsd / sourceUnitsPerUsd)).toFixed(6),
    currencyCode: targetCurrency,
  };
}

export function formatMoney(amount: string | number, currencyCode: string) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return `${currencyCode} ${amount}`;

  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyCode,
      currencyDisplay: 'symbol',
    }).format(numericAmount);
  } catch {
    return `${currencyCode} ${amount}`;
  }
}

export function formatPriceRange(minPrice: ShopifyMoney, maxPrice: ShopifyMoney) {
  const min = Number(minPrice.amount);
  const max = Number(maxPrice.amount);
  const formattedMin = formatMoney(minPrice.amount, minPrice.currencyCode);

  if (minPrice.currencyCode !== maxPrice.currencyCode) {
    return `${formattedMin} – ${formatMoney(maxPrice.amount, maxPrice.currencyCode)}`;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return formattedMin;
  if (min < max) return `From ${formattedMin}`;
  if (min > max) return `${formattedMin} – ${formatMoney(maxPrice.amount, maxPrice.currencyCode)}`;
  return formattedMin;
}
