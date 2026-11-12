import { useState, useCallback, useEffect } from "react";

interface Props {
    pool: string;
    wallet: string;
    block: string;
    loading: boolean;
    onAnalyze: (pool: string, wallet: string, block: string) => void;
}

function isAddress(s: string): boolean {
    return /^0x[0-9a-fA-F]{40}$/.test(s);
}

function charCountLabel(value: string, maxLen = 42): string {
    if (value === "") return "";
    return `${value.length}/${maxLen}`;
}

function charCountClass(value: string): string {
    if (value === "") return "";
    if (isAddress(value)) return "lp-input-char-count--valid";
    if (value.length > 0) return "lp-input-char-count--error";
    return "";
}

export function LPInputBar({ pool, wallet, block, loading, onAnalyze }: Props) {
    const [localPool, setLocalPool] = useState(pool);
    const [localWallet, setLocalWallet] = useState(wallet);
    const [localBlock, setLocalBlock] = useState(block);

    // Sync local state when parent updates URL params (e.g. "TRY DEMO" button)
    useEffect(() => {
        setLocalPool(pool);
    }, [pool]);
    useEffect(() => {
        setLocalWallet(wallet);
    }, [wallet]);
    useEffect(() => {
        setLocalBlock(block);
    }, [block]);

    const poolValid = localPool === "" || isAddress(localPool);
    const walletValid = localWallet === "" || isAddress(localWallet);
    const canAnalyze = isAddress(localPool) && isAddress(localWallet) && !loading;

    const handleSubmit = useCallback(() => {
        if (canAnalyze) onAnalyze(localPool, localWallet, localBlock);
    }, [canAnalyze, localPool, localWallet, localBlock, onAnalyze]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "Enter") handleSubmit();
        },
        [handleSubmit]
    );

    return (
        <div className="lp-input-bar">
            <div className={`lp-input-row${!poolValid ? " lp-input-row--error" : ""}`}>
                <label className="lp-input-label">POOL</label>
                <input
                    className="lp-input"
                    placeholder="0xd0b53d9277642d899df5c87a3966a349a798f224"
                    value={localPool}
                    onChange={(e) => setLocalPool(e.target.value)}
                    onKeyDown={handleKeyDown}
                    spellCheck={false}
                    autoComplete="off"
                />
                {localPool && (
                    <span className={`lp-input-char-count ${charCountClass(localPool)}`}>
                        {charCountLabel(localPool)}
                    </span>
                )}
            </div>
            <div className={`lp-input-row${!walletValid ? " lp-input-row--error" : ""}`}>
                <label className="lp-input-label">WALLET</label>
                <input
                    className="lp-input"
                    placeholder="0xAbCd…"
                    value={localWallet}
                    onChange={(e) => setLocalWallet(e.target.value)}
                    onKeyDown={handleKeyDown}
                    spellCheck={false}
                    autoComplete="off"
                />
                {localWallet && (
                    <span className={`lp-input-char-count ${charCountClass(localWallet)}`}>
                        {charCountLabel(localWallet)}
                    </span>
                )}
            </div>
            <div className="lp-input-actions">
                <div className="lp-block-field">
                    <span className="lp-block-label">BLOCK</span>
                    <input
                        className="lp-input--block"
                        placeholder="latest"
                        value={localBlock}
                        onChange={(e) => {
                            const v = e.target.value;
                            if (v === "" || /^\d+$/.test(v)) setLocalBlock(v);
                        }}
                        onKeyDown={handleKeyDown}
                        spellCheck={false}
                        inputMode="numeric"
                        title="Optional snapshot block number. Leave blank for latest."
                    />
                    {localBlock ? (
                        <button className="lp-reset-btn" onClick={() => setLocalBlock("")} title="Reset to latest">
                            ↺
                        </button>
                    ) : (
                        <span className="lp-block-hint">optional</span>
                    )}
                </div>
                <div className="lp-analyze-actions">
                    {canAnalyze && <span className="lp-enter-hint">↵ Enter</span>}
                    <button className="lp-analyze-btn" disabled={!canAnalyze} onClick={handleSubmit}>
                        {loading ? "LOADING…" : "ANALYZE →"}
                    </button>
                </div>
            </div>
        </div>
    );
}
