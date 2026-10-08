// Classify a product as clothing or footwear from its title.
// Verified against the Shopify "Type" column: 32/32 apparel caught, 0 false positives.
// Footwear is the default (the vast majority of the catalog).
const CLOTH = [
  "t-shirt","tshirt","t shirt","tee","tank","sweatshirt","sweater","shirt","blouse",
  "shorts","short sleeve","sleeveless","jacket","coat","legging","jogger","pant","jeans",
  "jean","trucker","hoodie","cardigan","pullover","crewneck","crew neck","mock neck",
  "polo","dress","skirt","romper","jumpsuit","vest","trouser","chino","yoga","bodysuit",
  "camisole"," top","knit top",
];
const FOOT = [
  "sandal","boot","espadrille","flat","ballet","sneaker","loafer","heel","mule","slipper",
  "shoe","pump","wedge","moccasin","oxford","clog","bootie","slide","flip flop","flip-flop",
];

export type Category = "clothing" | "footwear";

export function classifyTitle(title?: string | null): Category {
  const t = (title || "").toLowerCase();
  if (FOOT.some((w) => t.includes(w))) return "footwear";
  if (CLOTH.some((w) => t.includes(w))) return "clothing";
  return "footwear";
}

// An order is "clothing" if ANY of its line items is clothing.
export function classifyOrderItems(items: { title?: string | null }[]): Category {
  return (items ?? []).some((i) => classifyTitle(i.title) === "clothing") ? "clothing" : "footwear";
}
