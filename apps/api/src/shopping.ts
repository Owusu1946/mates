export const trustedGhanaRetailers = {
  "jumia.com.gh": "Jumia Ghana",
  "compughana.com": "CompuGhana",
  "frankotrading.com": "Franko Trading",
  "telefonika.com": "Telefonika",
  "hubtel.com": "Hubtel",
  "melcom.com": "Melcom",
  "electromart.com.gh": "Electromart",
  "superprice.com": "SuperPrice",
  "get4lessghana.com": "Get4Less Ghana",
  "shopbeta.com.gh": "Shopbeta",
};

export function trustedRetailer(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return Object.entries(trustedGhanaRetailers).find(([domain]) => host === domain || host.endsWith(`.${domain}`))?.[1];
  } catch { return undefined; }
}

export const shoppingInstructions = `For shopping in Ghana, the user's trusted retailers are ${Object.entries(trustedGhanaRetailers).map(([domain, name]) => `${name} (https://${domain})`).join(", ")}. Search these domains using site: queries; do not recommend other retailers unless the user explicitly asks to expand beyond this list. If no match is verified, explain that honestly. For product listings, browser_read must extract the product fields from the actual listing, never search snippets. Then call cooper_show_results with toolkit web and the exact listing URL as sourceId. Product cards are populated from extracted evidence, not presentation arguments. Verify exact model, price, currency, specifications and availability; unknown availability stays unknown. Never substitute another model silently. Use View on retailer, not Buy, and do not repeat all card details in prose.`;
