export interface FeedInfo {
    id: string;
    symbol: string;
    name: string;
    category: "crypto" | "stablecoin" | "defi" | "lsd";
}
