import type { Language } from "../database/store.js";

// Short, reusable definitions; only show the relevant term in feature screens.
export const glossary = {
  ko: {
    pair: "FX Pair — 서로 교환하려는 두 자산의 조합입니다. 예: USDC/XSGD",
    quote: "Quote — 지금 이 조건으로 예상되는 교환 결과입니다.",
    spread: "스프레드 (Spread) — 사려는 가격과 팔려는 가격의 차이입니다.",
    size: "거래 가능 규모 — 현재 조건에서 유효한 Quote를 받을 수 있는 거래 규모입니다.",
    limit: "지정가 주문 (Limit Order) — 원하는 환율을 지정해두는 주문 방식입니다.",
    vault: "Vault — 프로토콜 안에서 자산을 보관하거나 거래에 사용하는 별도 잔액 영역입니다.",
  },
  en: {
    pair: "FX pair — The two assets you want to exchange, for example USDC/XSGD.",
    quote: "Quote — The exchange result expected under the current conditions.",
    spread: "Spread — The difference between buying and selling prices.",
    size: "Quoted trade size — An amount for which a valid quote is available under current conditions.",
    limit: "Limit order — An order with an exchange rate you choose.",
    vault: "Vault — A separate balance area within the protocol for storing assets or using them in trades.",
  },
} as const;

export function glossaryText(language: Language): string {
  return [(language === "ko" ? "FX 용어 쉽게 보기" : "Simple FX terms"),
    ...Object.values(glossary[language]),
    language === "ko"
      ? "현재 봇은 스프레드 조회·알림, 지정가 주문, Vault 관리를 지원하지 않습니다. 거래 가능 규모는 총 유동성을 뜻하지 않습니다."
      : "Spread views/alerts, limit orders and Vault management are not currently supported. Quoted sizes do not represent total liquidity.",
  ].join("\n\n");
}
