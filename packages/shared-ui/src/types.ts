export interface OHLCVCandle {
    timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    volume_usd?: number;
    quote_rate_usd?: number;
}
