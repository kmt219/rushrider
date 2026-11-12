import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(__dirname, "../public/og-image.png");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <!-- Background -->
  <rect width="1200" height="630" fill="#0b0b0b"/>

  <!-- Subtle horizontal grid lines -->
  <line x1="0" y1="210" x2="1200" y2="210" stroke="#161616" stroke-width="1"/>
  <line x1="0" y1="420" x2="1200" y2="420" stroke="#161616" stroke-width="1"/>

  <!-- Left green accent bar -->
  <rect x="0" y="0" width="4" height="630" fill="#00cc66"/>

  <!-- Vertical divider -->
  <line x1="660" y1="40" x2="660" y2="576" stroke="#1e1e1e" stroke-width="1"/>

  <!-- GOLDRUSH label (top-left) -->
  <text x="60" y="88" font-family="Courier New,Courier,monospace" font-size="13" fill="#00cc66" font-weight="bold" letter-spacing="5">GOLDRUSH</text>

  <!-- DEX large text -->
  <text x="55" y="220" font-family="Courier New,Courier,monospace" font-size="140" fill="#ffffff" font-weight="bold">DEX</text>

  <!-- Feature list -->
  <text x="62" y="278" font-family="Courier New,Courier,monospace" font-size="15" fill="#666666">&#x25B8; Real-time pair discovery</text>
  <text x="62" y="306" font-family="Courier New,Courier,monospace" font-size="15" fill="#666666">&#x25B8; OHLCV charting</text>
  <text x="62" y="334" font-family="Courier New,Courier,monospace" font-size="15" fill="#666666">&#x25B8; LP position analytics</text>

  <!-- Chain badges -->
  <rect x="62" y="374" width="74" height="24" rx="2" fill="#0d2b1c" stroke="#00cc66" stroke-width="1"/>
  <text x="99" y="391" font-family="Courier New,Courier,monospace" font-size="11" fill="#00cc66" text-anchor="middle" font-weight="bold">BASE</text>

  <rect x="148" y="374" width="90" height="24" rx="2" fill="#1a1a1a" stroke="#2a2a2a" stroke-width="1"/>
  <text x="193" y="391" font-family="Courier New,Courier,monospace" font-size="11" fill="#555555" text-anchor="middle">MEGAETH</text>

  <rect x="250" y="374" width="56" height="24" rx="2" fill="#1a1a1a" stroke="#2a2a2a" stroke-width="1"/>
  <text x="278" y="391" font-family="Courier New,Courier,monospace" font-size="11" fill="#555555" text-anchor="middle">BNB</text>

  <rect x="318" y="374" width="70" height="24" rx="2" fill="#1a1a1a" stroke="#2a2a2a" stroke-width="1"/>
  <text x="353" y="391" font-family="Courier New,Courier,monospace" font-size="11" fill="#555555" text-anchor="middle">MONAD</text>

  <!-- STREAMING indicator -->
  <rect x="62" y="434" width="10" height="10" fill="#00cc66"/>
  <text x="82" y="444" font-family="Courier New,Courier,monospace" font-size="11" fill="#00cc66" letter-spacing="2">STREAMING</text>

  <!-- Right: table header -->
  <text x="700" y="88" font-family="Courier New,Courier,monospace" font-size="11" fill="#333333" letter-spacing="3">PAIR</text>
  <text x="980" y="88" font-family="Courier New,Courier,monospace" font-size="11" fill="#333333" letter-spacing="3" text-anchor="end">PRICE</text>
  <text x="1130" y="88" font-family="Courier New,Courier,monospace" font-size="11" fill="#333333" letter-spacing="3" text-anchor="end">SAFE</text>
  <line x1="690" y1="98" x2="1150" y2="98" stroke="#1e1e1e" stroke-width="1"/>

  <!-- Row 1 -->
  <text x="700" y="146" font-family="Courier New,Courier,monospace" font-size="17" fill="#aaaaaa" font-weight="bold">ETH/USDC</text>
  <text x="980" y="146" font-family="Courier New,Courier,monospace" font-size="17" fill="#cccccc" text-anchor="end">$2,541</text>
  <text x="1130" y="146" font-family="Courier New,Courier,monospace" font-size="17" fill="#00cc66" text-anchor="end">&#x25CE; 92</text>

  <!-- Row 2 (highlighted) -->
  <rect x="690" y="156" width="470" height="42" fill="#0a2016"/>
  <rect x="690" y="156" width="3" height="42" fill="#00cc66"/>
  <text x="706" y="183" font-family="Courier New,Courier,monospace" font-size="17" fill="#ffffff" font-weight="bold">WBTC/ETH</text>
  <text x="980" y="183" font-family="Courier New,Courier,monospace" font-size="17" fill="#00cc66" text-anchor="end">$62.4K</text>
  <text x="1130" y="183" font-family="Courier New,Courier,monospace" font-size="17" fill="#00cc66" text-anchor="end">&#x25CE; 87</text>

  <!-- Row 3 -->
  <text x="700" y="230" font-family="Courier New,Courier,monospace" font-size="17" fill="#aaaaaa" font-weight="bold">SOL/USDC</text>
  <text x="980" y="230" font-family="Courier New,Courier,monospace" font-size="17" fill="#cccccc" text-anchor="end">$184</text>
  <text x="1130" y="230" font-family="Courier New,Courier,monospace" font-size="17" fill="#00cc66" text-anchor="end">&#x25CE; 74</text>

  <!-- Row 4 (dim) -->
  <text x="700" y="272" font-family="Courier New,Courier,monospace" font-size="17" fill="#2a2a2a" font-weight="bold">PEPE/WETH</text>
  <text x="980" y="272" font-family="Courier New,Courier,monospace" font-size="17" fill="#2a2a2a" text-anchor="end">$0.0000093</text>
  <text x="1130" y="272" font-family="Courier New,Courier,monospace" font-size="17" fill="#2a2a2a" text-anchor="end">&#x25CE; 61</text>

  <!-- LP + COMPARE buttons -->
  <rect x="700" y="360" width="44" height="22" rx="2" fill="#0a2016" stroke="#00cc66" stroke-width="1"/>
  <text x="722" y="376" font-family="Courier New,Courier,monospace" font-size="11" fill="#00cc66" text-anchor="middle" font-weight="bold">LP</text>

  <rect x="756" y="360" width="84" height="22" rx="2" fill="#1a1a1a" stroke="#2a2a2a" stroke-width="1"/>
  <text x="798" y="376" font-family="Courier New,Courier,monospace" font-size="11" fill="#555555" text-anchor="middle">COMPARE</text>

  <!-- Bottom separator -->
  <line x1="0" y1="576" x2="1200" y2="576" stroke="#1e1e1e" stroke-width="1"/>

  <!-- Footer -->
  <text x="600" y="608" font-family="Courier New,Courier,monospace" font-size="12" fill="#333333" text-anchor="middle" letter-spacing="4">POWERED BY GOLDRUSH  &#xB7;  dex.goldrush.dev</text>
</svg>`;

const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 1200 },
    font: { loadSystemFonts: true },
});
const pngData = resvg.render();
writeFileSync(OUTPUT, pngData.asPng());
console.log("✓ og-image.png written to apps/dexworks/public/");
