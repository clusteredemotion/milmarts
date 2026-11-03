import { createContext, useContext } from "react";
import type { VisitorMarket } from "@workspace/api-client-react";

export const VisitorCurrencyContext = createContext<VisitorMarket | null>(null);

export function useVisitorCurrency() {
  return useContext(VisitorCurrencyContext);
}
