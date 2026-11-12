export interface ComparePair {
    label: string;
    baseToken: string;
    quoteToken: string;
    kumbaya: string;
    prism: string;
}

export const COMPARE_PAIRS: ComparePair[] = [
    {
        label: "USDm / USDT",
        baseToken: "USDm",
        quoteToken: "USDT",
        kumbaya: "0x6c8E5D463a2473b1A8bcd87e1cEA2724203A1D8f",
        prism: "0x41cB3DD6824Bb9c4cFC0cc4E15675F7a2E6aF869",
    },
    {
        label: "USDm / WETH",
        baseToken: "USDm",
        quoteToken: "WETH",
        kumbaya: "0x587F6eeAfc7Ad567e96eD1B62775fA6402164b22",
        prism: "0xC2FaC0B5B6C075819E654bcFbBBCda2838609d32",
    },
    {
        label: "USDT / WETH",
        baseToken: "USDT",
        quoteToken: "WETH",
        kumbaya: "0x2809696F2e42eB452C32C3d0A2Dc540858C14125",
        prism: "0x7291823016D7326339F3efC487Db465AFeD5a70C",
    },
    {
        label: "BTC.b / USDm",
        baseToken: "BTC.b",
        quoteToken: "USDm",
        kumbaya: "0xc1838B7807e5bd4D56EA630BA35Ac964CF72c9db",
        prism: "0x2A69D05F3613b89e58D9cD2E0B35d14A67902aEC",
    },
    {
        label: "BTC.b / USDT",
        baseToken: "BTC.b",
        quoteToken: "USDT",
        kumbaya: "0xf72aFD98A6f9930de43f62473136A656dFD35604",
        prism: "0xad284761d8a7Fab0FEeE790061314CFACC31BBb4",
    },
];

export const ALL_COMPARE_ADDRESSES = COMPARE_PAIRS.flatMap((p) => [p.kumbaya, p.prism]);
