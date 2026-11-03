import type { Money } from "@workspace/api-client-react";
import { convertMoney, formatPriceRange } from "@/lib/money";
import { useVisitorCurrency } from "@/lib/visitor-currency-context";

type ShopifyPriceProps =
  | {
      amount: Money;
      minAmount?: never;
      maxAmount?: never;
      className?: string;
    }
  | {
      amount?: never;
      minAmount: Money;
      maxAmount: Money;
      className?: string;
    };

function formatRateDate(value: string | Date): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

export function ShopifyPrice(props: ShopifyPriceProps) {
  const visitorCurrency = useVisitorCurrency();
  const isRange = "minAmount" in props;
  const sourceMin = isRange ? props.minAmount : props.amount;
  const sourceMax = isRange ? props.maxAmount : props.amount;

  if (!sourceMin || !sourceMax) return null;

  const sourceLabel = formatPriceRange(sourceMin, sourceMax);
  const convertedMin = visitorCurrency
    ? convertMoney(sourceMin, visitorCurrency)
    : null;
  const convertedMax = visitorCurrency
    ? convertMoney(sourceMax, visitorCurrency)
    : null;
  const hasLocalRange = Boolean(convertedMin && convertedMax);
  const displayLabel = hasLocalRange
    ? formatPriceRange(convertedMin!, convertedMax!)
    : sourceLabel;
  const alreadyInVisitorCurrency =
    sourceMin.currencyCode.toUpperCase() === visitorCurrency?.currencyCode.toUpperCase() &&
    sourceMax.currencyCode.toUpperCase() === visitorCurrency?.currencyCode.toUpperCase();
  const updatedAt = visitorCurrency?.updatedAt;

  return (
    <span className={`market-price-conversion ${props.className ?? ""}`.trim()}>
      <strong>{displayLabel}</strong>
      {hasLocalRange && !alreadyInVisitorCurrency && (
        <small>
          Approx. {sourceLabel}
          {updatedAt ? ` · rate updated ${formatRateDate(updatedAt)}` : ""}
          {visitorCurrency?.isStale ? " · rate may be out of date" : ""}
        </small>
      )}
      {visitorCurrency && !hasLocalRange && !alreadyInVisitorCurrency && (
        <small>Local conversion unavailable; showing the Shopify currency</small>
      )}
    </span>
  );
}
