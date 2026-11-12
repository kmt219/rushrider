import { CHAINS, getDisplayName, getWrappedNativeAddress } from "../lib/chains";
import { classifyTransaction } from "../lib/classifier";
import type { ProcessingState, Transaction, Transfer, Token } from "../lib/types";
import { isZeroAddress, normalizeAddress, dateToKey } from "../lib/utils";
import type { GoldRushClient } from "@covalenthq/client-sdk";
import { useCallback, useRef, useState } from "react";

const NATIVE_TOKEN_ADDRESS = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const PAGE_SIZE = 100;

interface UseProcessingResult {
    state: ProcessingState;
    transactions: Transaction[];
    start: (wallet: string) => void;
    reset: () => void;
}

const INITIAL_STATE: ProcessingState = {
    step: "idle",
    progress: "",
    chainsFound: 0,
    txFetched: 0,
    txTotal: 0,
    errors: [],
};

export function useProcessing(client: GoldRushClient): UseProcessingResult {
    const [state, setState] = useState<ProcessingState>(INITIAL_STATE);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const abortRef = useRef<AbortController | null>(null);

    const updateState = (patch: Partial<ProcessingState>) => {
        setState((prev) => ({ ...prev, ...patch }));
    };

    const start = useCallback(
        async (wallet: string) => {
            abortRef.current?.abort();
            const abort = new AbortController();
            abortRef.current = abort;

            setTransactions([]);
            setState({ ...INITIAL_STATE, step: "discovering", progress: "Discovering active chains..." });

            try {
                // Step 1: Discover active chains
                const activityResp = await client.BaseService.getAddressActivity(wallet.trim() as `0x${string}`);
                if (abort.signal.aborted) return;

                if (activityResp.error) {
                    updateState({ step: "idle", errors: [activityResp.error_message ?? "Failed to fetch activity"] });
                    return;
                }

                const activeChains = (activityResp.data?.items ?? [])
                    .filter((item) => {
                        const name = item.chain_name ?? "";
                        return name in CHAINS;
                    })
                    .map((item) => item.chain_name!);

                if (activeChains.length === 0) {
                    updateState({ step: "idle", errors: ["No EVM chain activity found for this address"] });
                    return;
                }

                updateState({
                    step: "fetching",
                    chainsFound: activeChains.length,
                    progress: `Found ${activeChains.length} chain(s). Fetching transactions...`,
                });

                // Step 2: Fetch transactions for each chain
                const allRawTx: Transaction[] = [];
                let totalFetched = 0;

                for (const chainName of activeChains) {
                    if (abort.signal.aborted) return;

                    let page = 0;
                    let hasMore = true;

                    while (hasMore) {
                        if (abort.signal.aborted) return;

                        updateState({
                            progress: `Fetching ${getDisplayName(chainName)} page ${page + 1}...`,
                            txFetched: totalFetched,
                        });

                        const txResp = await client.TransactionService.getAllTransactionsForAddressByPage(
                            chainName as Parameters<
                                typeof client.TransactionService.getAllTransactionsForAddressByPage
                            >[0],
                            wallet.trim() as `0x${string}`,
                            { "page-number": page, "page-size": PAGE_SIZE, "no-logs": false }
                        );

                        if (txResp.error) {
                            updateState((prev) => ({
                                ...prev,
                                errors: [...prev.errors, `${chainName}: ${txResp.error_message ?? "fetch error"}`],
                            }));
                            break;
                        }

                        const items = txResp.data?.items ?? [];
                        if (items.length === 0) {
                            hasMore = false;
                            break;
                        }

                        for (const item of items) {
                            const tx = parseTransaction(item, chainName, wallet);
                            if (tx) allRawTx.push(tx);
                        }

                        totalFetched += items.length;
                        hasMore = items.length >= PAGE_SIZE;
                        page++;
                    }
                }

                if (abort.signal.aborted) return;
                updateState({
                    step: "pricing",
                    txFetched: totalFetched,
                    progress: `Fetched ${totalFetched} transactions. Resolving prices...`,
                });

                // Step 3: Fetch prices for tokens missing rates
                await resolvePrices(client, allRawTx, abort.signal, (msg) => updateState({ progress: msg }));
                if (abort.signal.aborted) return;

                // Step 4: Classify
                updateState({ step: "classifying", progress: "Classifying transactions..." });
                for (const tx of allRawTx) {
                    const result = classifyTransaction(tx, wallet);
                    tx.category = result.category;
                    tx.transfers = result.transfers;
                }

                // Step 5: Sort and finalize
                allRawTx.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

                updateState({ step: "calculating", progress: "Calculating tax events..." });

                // Step 6: Done
                setTransactions(allRawTx);
                updateState({
                    step: "done",
                    progress: `Processed ${allRawTx.length} transactions across ${activeChains.length} chain(s).`,
                });
            } catch (err) {
                if (!abort.signal.aborted) {
                    const msg = err instanceof Error ? err.message : String(err);
                    updateState({ step: "idle", errors: [msg] });
                }
            }
        },
        [client]
    );

    const reset = useCallback(() => {
        abortRef.current?.abort();
        setTransactions([]);
        setState(INITIAL_STATE);
    }, []);

    return { state, transactions, start, reset };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseTransaction(item: any, chainName: string, wallet: string): Transaction | null {
    const hash = item.tx_hash as string;
    const timestamp = new Date(item.block_signed_at as string);
    const successful = item.successful as boolean;
    const gasQuote = (item.gas_quote as number) ?? 0;
    const gasSpent = (item.gas_spent as number) ?? 0;
    const gasPrice = (item.gas_price as number) ?? 0;
    const toAddress = (item.to_address as string) ?? "";
    const toLabel = (item.to_address_label as string) ?? null;
    const value = BigInt(item.value ?? "0");
    const methodId = (item.tx_hash as string)?.slice(0, 10) ?? "";

    const transfers: Transfer[] = [];
    const walletLower = normalizeAddress(wallet);
    const chainConfig = CHAINS[chainName];

    // Native value transfer
    if (value > 0n && chainConfig) {
        const nativeToken: Token = {
            contractAddress: NATIVE_TOKEN_ADDRESS,
            symbol: chainConfig.nativeSymbol,
            decimals: 18,
            name: chainConfig.nativeSymbol,
        };
        const amount = Number(value) / 1e18;
        const from = normalizeAddress(item.from_address as string);
        const to = normalizeAddress(toAddress);

        transfers.push({
            from,
            to,
            amount,
            token: nativeToken,
            rate: 0, // will be resolved in pricing step
            treatment: "ignore",
            bucket: from === walletLower ? "SENT" : "RECEIVED",
        });
    }

    // ERC20 transfers from decoded log events
    const logEvents = (item.log_events as Array<Record<string, unknown>>) ?? [];
    for (const log of logEvents) {
        const decoded = log.decoded as { name?: string; params?: Array<{ name: string; value: string }> } | null;
        if (!decoded || decoded.name !== "Transfer") continue;

        const params = decoded.params ?? [];
        const fromParam = params.find((p) => p.name === "from")?.value;
        const toParam = params.find((p) => p.name === "to")?.value;
        const valueParam = params.find((p) => p.name === "value")?.value;

        if (!fromParam || !toParam || !valueParam) continue;

        const from = normalizeAddress(fromParam);
        const to = normalizeAddress(toParam);

        // Only include transfers involving the wallet
        if (from !== walletLower && to !== walletLower) continue;

        const decimals = (log.sender_contract_decimals as number) ?? 18;
        const rawAmount = BigInt(valueParam);
        const amount = Number(rawAmount) / Math.pow(10, decimals);

        // Skip dust
        if (amount === 0) continue;

        const token: Token = {
            contractAddress: normalizeAddress((log.sender_address as string) ?? ""),
            symbol: (log.sender_contract_ticker_symbol as string) ?? "???",
            decimals,
            name: (log.sender_name as string) ?? "Unknown",
        };

        let bucket: Transfer["bucket"] = "SELF";
        if (isZeroAddress(toParam)) bucket = "BURNED";
        else if (isZeroAddress(fromParam)) bucket = "MINTED";
        else if (from === walletLower && to !== walletLower) bucket = "SENT";
        else if (to === walletLower && from !== walletLower) bucket = "RECEIVED";

        transfers.push({
            from,
            to,
            amount,
            token,
            rate: 0,
            treatment: "ignore",
            bucket,
        });
    }

    if (transfers.length === 0 && gasQuote === 0 && !successful) return null;

    return {
        hash,
        timestamp,
        chain: chainName,
        chainDisplayName: getDisplayName(chainName),
        blockHeight: item.block_height as number,
        transfers,
        category: "UNKNOWN",
        counterparty: toAddress,
        counterpartyLabel: toLabel,
        gasFeeNative: (gasSpent * gasPrice) / 1e18,
        gasFeesUsd: gasQuote,
        successful,
        rawMethodId: methodId,
    };
}

/** Resolve USD prices for transfers missing rates */
async function resolvePrices(
    client: GoldRushClient,
    transactions: Transaction[],
    signal: AbortSignal,
    onProgress: (msg: string) => void
): Promise<void> {
    // Collect unique (chain, contract, date) tuples needing prices
    const priceNeeds = new Map<string, { chain: string; contract: string; dates: Set<string> }>();

    for (const tx of transactions) {
        for (const t of tx.transfers) {
            let contract = t.token.contractAddress;
            // For native tokens, use wrapped native address
            if (contract === NATIVE_TOKEN_ADDRESS) {
                const wrapped = getWrappedNativeAddress(tx.chain);
                if (!wrapped) continue;
                contract = normalizeAddress(wrapped);
            }
            const key = `${tx.chain}:${contract}`;
            let entry = priceNeeds.get(key);
            if (!entry) {
                entry = { chain: tx.chain, contract, dates: new Set() };
                priceNeeds.set(key, entry);
            }
            entry.dates.add(dateToKey(tx.timestamp));
        }
    }

    // Fetch prices per token
    const priceCache = new Map<string, number>(); // "chain:contract:YYYY-MM-DD" → price
    let fetched = 0;
    const total = priceNeeds.size;

    for (const [, need] of priceNeeds) {
        if (signal.aborted) return;
        fetched++;
        onProgress(`Fetching prices: ${fetched}/${total} tokens...`);

        const datesArr = Array.from(need.dates).sort();
        if (datesArr.length === 0) continue;

        const from = datesArr[0]!;
        const to = datesArr[datesArr.length - 1]!;

        try {
            const resp = await client.PricingService.getTokenPrices(
                need.chain as Parameters<typeof client.PricingService.getTokenPrices>[0],
                "USD",
                need.contract,
                { from, to }
            );

            if (!resp.error && resp.data) {
                for (const tokenData of resp.data) {
                    const prices = (tokenData as { prices?: Array<{ date: string; price: number }> }).prices ?? [];
                    for (const p of prices) {
                        const dateStr = typeof p.date === "string" ? p.date.slice(0, 10) : "";
                        if (dateStr) {
                            priceCache.set(`${need.chain}:${need.contract}:${dateStr}`, p.price);
                        }
                    }
                }
            }
        } catch {
            // Price fetch failed — leave rate as 0
        }
    }

    // Apply prices to transfers
    for (const tx of transactions) {
        for (const t of tx.transfers) {
            if (t.rate > 0) continue;
            let contract = t.token.contractAddress;
            if (contract === NATIVE_TOKEN_ADDRESS) {
                const wrapped = getWrappedNativeAddress(tx.chain);
                if (!wrapped) continue;
                contract = normalizeAddress(wrapped);
            }
            const dateStr = dateToKey(tx.timestamp);
            const price = priceCache.get(`${tx.chain}:${contract}:${dateStr}`);
            if (price !== undefined) {
                t.rate = price;
            }
        }
    }
}
