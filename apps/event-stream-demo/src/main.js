import optimisticOracleAbi from "./abi/optimistic-oracle-v2.json";
import "./style.css";
import { Interface, toUtf8String } from "ethers";
import { createClient } from "graphql-ws";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration (build-time env vars via Vite)
// ─────────────────────────────────────────────────────────────────────────────
const GOLDRUSH_API_KEY = import.meta.env.VITE_GOLDRUSH_API_KEY;
const GOLDRUSH_STREAM_URL =
    import.meta.env.VITE_GOLDRUSH_STREAM_URL || "wss://goldrush-streaming.covalenthq.com/graphql";

// Wallet address that uses the Optimistic Oracle V2 ABI
const OPTIMISTIC_ORACLE_WALLET = "0xee3afe347d5c74317041e2618c49534daf887c24";

// Supported chains
const CHAINS = [
    "POLYGON_MAINNET",
    "BASE_MAINNET",
    "BSC_MAINNET",
    "ETH_MAINNET",
    "HYPERCORE_MAINNET",
    "HYPEREVM_MAINNET",
    "MONAD_MAINNET",
    "MEGAETH_MAINNET",
];

// Block explorer URLs
const BLOCK_EXPLORERS = {
    POLYGON_MAINNET: "https://polygonscan.com",
    BASE_MAINNET: "https://basescan.org",
    BSC_MAINNET: "https://bscscan.com",
    ETH_MAINNET: "https://etherscan.io",
    MONAD_MAINNET: "https://explorer.monad.xyz",
    HYPERCORE_MAINNET: "https://explorer.hypercore.network",
    HYPEREVM_MAINNET: "https://explorer.hyperevm.network",
    MEGAETH_MAINNET: "https://megaexplorer.xyz",
};

if (!GOLDRUSH_API_KEY) {
    document.querySelector("#app").innerHTML = `
    <div class="error">
      <h2>Missing API Key</h2>
      <p>Set <code>VITE_GOLDRUSH_API_KEY</code> in your <code>.env</code> file.</p>
    </div>
  `;
    throw new Error("VITE_GOLDRUSH_API_KEY is required");
}

// ─────────────────────────────────────────────────────────────────────────────
// ABI Interface for Optimistic Oracle log decoding
// ─────────────────────────────────────────────────────────────────────────────
const optimisticOracleInterface = new Interface(optimisticOracleAbi);

// Event parameter names mapping
const EVENT_PARAMS = {
    RequestPrice: ["requester", "identifier", "timestamp", "ancillaryData", "currency", "reward", "finalFee"],
    ProposePrice: [
        "requester",
        "proposer",
        "identifier",
        "timestamp",
        "ancillaryData",
        "proposedPrice",
        "expirationTimestamp",
        "currency",
    ],
    DisputePrice: ["requester", "proposer", "disputer", "identifier", "timestamp", "ancillaryData", "proposedPrice"],
    Settle: ["requester", "proposer", "disputer", "identifier", "timestamp", "ancillaryData", "price", "payout"],
};

/**
 * Attempt to decode a log using the Optimistic Oracle ABI.
 * Only used when watching the specific wallet address.
 */
function decodeLogWithOptimisticOracle(log) {
    try {
        const parsed = optimisticOracleInterface.parseLog({
            topics: log.topics,
            data: log.data,
        });
        if (parsed) {
            return {
                decoded: true,
                event: parsed.name,
                args: parsed.args,
                signature: parsed.signature,
            };
        }
    } catch {
        // Not a log from this ABI
    }
    return { decoded: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// UI Setup
// ─────────────────────────────────────────────────────────────────────────────
const app = document.querySelector("#app");
app.innerHTML = `
  <header>
    <h1>Live Events Stream Demo</h1>
    <p class="subtitle">Streamed blockchain events in real-time</p>
    <div class="powered-by">
      <img src="https://www.datocms-assets.com/86369/1770243000-goldrush-logo-powered-by-covalent-dark-1.png" alt="Powered by Covalent" class="covalent-logo" />
    </div>
  </header>

  <div class="controls">
    <div class="input-group full-width">
      <label for="preset-select">Quick Select</label>
      <select id="preset-select">
        <option value="polymarket" selected>Polymarket UMA Oracle Feed</option>
        <option value="weth-base">WETH on Base</option>
        <option value="usdc-monad">USDC on Monad</option>
        <option value="usdm-megaeth">USDm on MegaETH</option>
      </select>
    </div>
    <div class="input-group">
      <label for="wallet-input">Wallet or Contract Address</label>
      <input
        type="text"
        id="wallet-input"
        placeholder="0x..."
        value="${OPTIMISTIC_ORACLE_WALLET}"
      />
    </div>
    <div class="input-group">
      <label for="chain-select">Chain</label>
      <select id="chain-select">
        ${CHAINS.map((chain) => `<option value="${chain}" ${chain === "POLYGON_MAINNET" ? "selected" : ""}>${chain}</option>`).join("")}
      </select>
    </div>
    <button id="subscribe-btn" class="btn primary">Subscribe</button>
    <button id="stop-btn" class="btn secondary" disabled>Stop</button>
  </div>
  
  <div id="status" class="status idle">Not connected</div>

  <div id="latency-metrics" class="latency-metrics"></div>

  <main id="events"></main>
`;

const presetSelect = document.querySelector("#preset-select");
const walletInput = document.querySelector("#wallet-input");
const chainSelect = document.querySelector("#chain-select");
const subscribeBtn = document.querySelector("#subscribe-btn");
const stopBtn = document.querySelector("#stop-btn");
const statusEl = document.querySelector("#status");
const eventsEl = document.querySelector("#events");

// Preset configurations
const PRESETS = {
    polymarket: {
        address: "0xee3afe347d5c74317041e2618c49534daf887c24",
        chain: "POLYGON_MAINNET",
    },
    "weth-base": {
        address: "0x4200000000000000000000000000000000000006",
        chain: "BASE_MAINNET",
    },
    "usdc-monad": {
        address: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
        chain: "MONAD_MAINNET",
    },
    "usdm-megaeth": {
        address: "0x587F6eeAfc7Ad567e96eD1B62775fA6402164b22",
        chain: "MEGAETH_MAINNET",
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────
let client = null;
let currentSubscription = null;
let currentWallet = null;

function setStatus(text, state) {
    statusEl.textContent = text;
    statusEl.className = `status ${state}`;
}

function showSkeletonLoading() {
    eventsEl.innerHTML = `
    <div class="skeleton-container">
      <div class="skeleton-card">
        <div class="skeleton-header">
          <div class="skeleton-line skeleton-hash"></div>
          <div class="skeleton-line skeleton-latency"></div>
        </div>
        <div class="skeleton-content">
          <div class="skeleton-line"></div>
          <div class="skeleton-line"></div>
          <div class="skeleton-line short"></div>
        </div>
      </div>
      <div class="skeleton-card">
        <div class="skeleton-header">
          <div class="skeleton-line skeleton-hash"></div>
          <div class="skeleton-line skeleton-latency"></div>
        </div>
        <div class="skeleton-content">
          <div class="skeleton-line"></div>
          <div class="skeleton-line"></div>
          <div class="skeleton-line short"></div>
        </div>
      </div>
      <div class="skeleton-card">
        <div class="skeleton-header">
          <div class="skeleton-line skeleton-hash"></div>
          <div class="skeleton-line skeleton-latency"></div>
        </div>
        <div class="skeleton-content">
          <div class="skeleton-line"></div>
          <div class="skeleton-line"></div>
          <div class="skeleton-line short"></div>
        </div>
      </div>
    </div>
  `;
}

function removeSkeletonLoading() {
    const skeleton = eventsEl.querySelector(".skeleton-container");
    if (skeleton) {
        skeleton.remove();
    }
}

// Latency tracking
let latencies = [];

function trackLatency(latencyMs) {
    latencies.push(latencyMs);
    // Keep only last 1000 samples
    if (latencies.length > 1000) {
        latencies.shift();
    }
    updateLatencyMetrics();
}

function updateLatencyMetrics() {
    if (latencies.length === 0) return;

    const sorted = [...latencies].sort((a, b) => a - b);
    const avg = sorted.reduce((sum, val) => sum + val, 0) / sorted.length;

    // Calculate percentiles using linear interpolation for better accuracy
    const percentile = (arr, p) => {
        const index = (arr.length - 1) * p;
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        const weight = index - lower;
        return arr[lower] * (1 - weight) + arr[upper] * weight;
    };

    const p50 = percentile(sorted, 0.5);
    const p95 = percentile(sorted, 0.95);
    const p99 = percentile(sorted, 0.99);

    const metricsEl = document.querySelector("#latency-metrics");
    if (metricsEl) {
        metricsEl.innerHTML = `
      <div class="metrics-header">Latency Metrics</div>
      <div class="metrics-values">
        <div class="metric">
          <span class="metric-label">Avg</span>
          <span class="metric-value">${Math.round(avg).toLocaleString()} ms</span>
        </div>
        <div class="metric">
          <span class="metric-label">P50</span>
          <span class="metric-value">${Math.round(p50).toLocaleString()} ms</span>
        </div>
        <div class="metric">
          <span class="metric-label">P95</span>
          <span class="metric-value">${Math.round(p95).toLocaleString()} ms</span>
        </div>
        <div class="metric">
          <span class="metric-label">P99</span>
          <span class="metric-value">${Math.round(p99).toLocaleString()} ms</span>
        </div>
        <div class="metric">
          <span class="metric-label">Events</span>
          <span class="metric-value">${latencies.length}</span>
        </div>
      </div>
    `;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// GraphQL Subscription Query Builder
// ─────────────────────────────────────────────────────────────────────────────
function buildSubscriptionQuery(chainName, walletAddress) {
    return `
subscription {
  walletTxs(
    chain_name: ${chainName},
    wallet_addresses: [
      "${walletAddress}",
    ]
  ) {
    tx_hash
    from_address
    to_address
    value
    chain_name
    block_signed_at
    block_height
    block_hash
    miner_address
    gas_used
    tx_offset
    successful
    decoded_type

    decoded_details {
      ... on TransferTransaction {
        from
        to
        amount
        quote_usd
        quote_rate_usd
        contract_metadata {
          contract_name
          contract_address
          contract_decimals
          contract_ticker_symbol
        }
      }
      ... on SwapTransaction {
        token_in {
          contract_name
          contract_address
          contract_decimals
          contract_ticker_symbol
        }
        token_out {
          contract_name
          contract_address
          contract_decimals
          contract_ticker_symbol
        }
        amount_in
        amount_out
      }
      ... on BridgeTransaction {
        type
        typeString
        from
        to
        amount
        quote_usd
        quote_rate_usd
        contract_metadata {
          contract_name
          contract_address
          contract_decimals
          contract_ticker_symbol
        }
      }
      ... on DepositTransaction {
        from
        to
        amount
        quote_usd
        quote_rate_usd
        contract_metadata {
          contract_name
          contract_address
          contract_decimals
          contract_ticker_symbol
        }
      }
      ... on WithdrawTransaction {
        from
        to
        amount
        quote_usd
        quote_rate_usd
        contract_metadata {
          contract_name
          contract_address
          contract_decimals
          contract_ticker_symbol
        }
      }
      ... on ApproveTransaction {
        spender
        amount
        quote_usd
        quote_rate_usd
        contract_metadata {
          contract_name
          contract_address
          contract_decimals
          contract_ticker_symbol
        }
      }
      ... on ErrorDetails {
        message
      }
    }

    logs {
      emitter_address
      log_offset
      data
      topics
    }
  }
}
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render a transaction card with decoded details and logs.
 */
function renderTx(tx, receivedAt, walletAddress) {
    // Deep clone the transaction to avoid reference issues
    const txData = JSON.parse(JSON.stringify(tx));

    const blockTime = new Date(txData.block_signed_at).getTime();
    const latencyMs = receivedAt - blockTime;

    // Track latency for metrics
    trackLatency(latencyMs);

    const card = document.createElement("article");
    card.className = "tx-card";

    // Store the latency as a data attribute for this specific card
    card.dataset.latency = latencyMs;
    card.dataset.txHash = txData.tx_hash;

    // Header
    const header = document.createElement("div");
    header.className = "tx-header";
    const txHash = txData.tx_hash || "Unknown";
    const chainName = txData.chain_name || "";

    // Normalize chain name: convert to uppercase and replace hyphens with underscores
    const normalizedChainName = chainName.toUpperCase().replace(/-/g, "_");
    const explorerUrl = BLOCK_EXPLORERS[normalizedChainName];

    // Only make it a link if we have a valid explorer URL, otherwise just show as text
    let txHashDisplay;
    if (explorerUrl && txHash !== "Unknown") {
        const txUrl = `${explorerUrl}/tx/${txHash}`;
        const shortHash = txHash.length > 18 ? `${txHash.slice(0, 10)}...${txHash.slice(-8)}` : txHash;
        txHashDisplay = `<a href="${txUrl}" target="_blank" rel="noopener noreferrer" class="tx-hash" title="${txHash}">${shortHash}</a>`;
    } else {
        const shortHash = txHash.length > 18 ? `${txHash.slice(0, 10)}...${txHash.slice(-8)}` : txHash;
        txHashDisplay = `<span class="tx-hash" title="${txHash}">${shortHash}</span>`;
    }

    header.innerHTML = `
    ${txHashDisplay}
    <span class="latency">${latencyMs.toLocaleString()} ms latency</span>
  `;
    card.appendChild(header);

    // Meta
    const meta = document.createElement("div");
    meta.className = "tx-meta";
    meta.innerHTML = `
    <div><strong>Block:</strong> ${txData.block_height ?? "N/A"}</div>
    <div><strong>Chain:</strong> ${txData.chain_name ?? "N/A"}</div>
    <div><strong>From:</strong> <code>${txData.from_address ?? "N/A"}</code></div>
    <div><strong>To:</strong> <code>${txData.to_address ?? "N/A"}</code></div>
    <div><strong>Value:</strong> ${txData.value ?? "0"}</div>
    <div><strong>Gas Used:</strong> ${txData.gas_used ?? "N/A"}</div>
    <div><strong>Status:</strong> ${txData.successful ? "Success" : "Failed"}</div>
    <div><strong>Type:</strong> ${txData.decoded_type || "Unknown"}</div>
  `;
    card.appendChild(meta);

    // Check if we're watching the Optimistic Oracle and find its event
    const isWatchingOptimisticOracle = walletAddress === OPTIMISTIC_ORACLE_WALLET.toLowerCase();
    let optimisticOracleEvent = null;

    if (isWatchingOptimisticOracle && txData.logs) {
        // Find the Optimistic Oracle log event
        for (const log of txData.logs) {
            if (log.emitter_address?.toLowerCase() === OPTIMISTIC_ORACLE_WALLET.toLowerCase()) {
                const decoded = decodeLogWithOptimisticOracle(log);
                if (decoded.decoded) {
                    optimisticOracleEvent = decoded;
                    break;
                }
            }
        }
    }

    // Display Optimistic Oracle event if found, otherwise show transfer details
    if (optimisticOracleEvent) {
        const decodedSection = document.createElement("div");
        decodedSection.className = "decoded-section optimistic-oracle-primary";
        decodedSection.innerHTML = `
      <h3>Optimistic Oracle Event: ${optimisticOracleEvent.event}</h3>
      <div class="decoded-content">${formatOptimisticOracleArgs(optimisticOracleEvent.args, optimisticOracleEvent.event)}</div>
    `;
        card.appendChild(decodedSection);
    } else if (txData.decoded_details) {
        const decodedSection = document.createElement("div");
        decodedSection.className = "decoded-section";
        decodedSection.innerHTML = `
      <h3>Decoded Details (${txData.decoded_type || "Unknown"})</h3>
      <div class="decoded-content">${renderDecodedDetails(txData.decoded_details)}</div>
    `;
        card.appendChild(decodedSection);
    }

    // Logs
    if (txData.logs && txData.logs.length > 0) {
        const logsSection = document.createElement("div");
        logsSection.className = "logs-section";

        const logsDetails = document.createElement("details");
        const logsSummary = document.createElement("summary");
        logsSummary.textContent = `Logs (${txData.logs.length})`;
        logsDetails.appendChild(logsSummary);

        const logsContainer = document.createElement("div");
        logsContainer.className = "logs-container";

        const useOptimisticOracle = walletAddress === OPTIMISTIC_ORACLE_WALLET;

        txData.logs.forEach((log, idx) => {
            const logEl = document.createElement("div");

            if (useOptimisticOracle) {
                const decoded = decodeLogWithOptimisticOracle(log);
                logEl.className = decoded.decoded ? "log decoded" : "log raw";

                if (decoded.decoded) {
                    logEl.innerHTML = `
            <div class="log-header">
              <span class="log-event">${decoded.event}</span>
              <span class="log-badge">Optimistic Oracle</span>
            </div>
            <div class="log-args">${formatArgs(decoded.args)}</div>
            <div class="log-emitter">Emitter: <code>${log.emitter_address}</code></div>
          `;
                } else {
                    logEl.innerHTML = `
            <div class="log-header">
              <span class="log-event">Log #${idx}</span>
              <span class="log-badge raw">Not Matched</span>
            </div>
            <div class="log-emitter">Emitter: <code>${log.emitter_address}</code></div>
            <div class="log-raw-data">
              <details>
                <summary>Raw Data</summary>
                <pre>${JSON.stringify({ topics: log.topics, data: log.data }, null, 2)}</pre>
              </details>
            </div>
          `;
                }
            } else {
                // For other wallets, just show raw log data
                logEl.className = "log raw";
                logEl.innerHTML = `
          <div class="log-header">
            <span class="log-event">Log #${idx}</span>
            <span class="log-badge raw">Raw</span>
          </div>
          <div class="log-emitter">Emitter: <code>${log.emitter_address}</code></div>
          <div class="log-raw-data">
            <details>
              <summary>Raw Data</summary>
              <pre>${JSON.stringify({ topics: log.topics, data: log.data }, null, 2)}</pre>
            </details>
          </div>
        `;
            }
            logsContainer.appendChild(logEl);
        });

        logsDetails.appendChild(logsContainer);
        logsSection.appendChild(logsDetails);
        card.appendChild(logsSection);
    }

    // Remove skeleton loading on first event
    removeSkeletonLoading();

    // Prepend so newest is on top
    eventsEl.prepend(card);

    // Keep max 50 cards (excluding skeleton)
    const cards = Array.from(eventsEl.children).filter((child) => !child.classList.contains("skeleton-container"));
    while (cards.length > 50) {
        eventsEl.removeChild(cards[cards.length - 1]);
    }
}

/**
 * Render decoded_details from the API response.
 */
function renderDecodedDetails(details) {
    if (!details) return "<em>No details</em>";

    // Check for error
    if (details.message) {
        return `<div class="error-detail"><strong>Error:</strong> ${details.message}</div>`;
    }

    const entries = [];

    // Handle contract metadata specially
    if (details.contract_metadata) {
        const cm = details.contract_metadata;
        entries.push(`
      <div class="contract-meta">
        <strong>Token:</strong> ${cm.contract_name || "Unknown"} (${cm.contract_ticker_symbol || "?"})
        <br><code>${cm.contract_address}</code>
        <br>Decimals: ${cm.contract_decimals ?? "N/A"}
      </div>
    `);
    }

    // Handle token_in / token_out objects specially
    for (const tokenKey of ["token_in", "token_out"]) {
        if (details[tokenKey] && typeof details[tokenKey] === "object") {
            const t = details[tokenKey];
            entries.push(`
      <div class="contract-meta">
        <strong>${formatKey(tokenKey)}:</strong> ${t.contract_name || "Unknown"} (${t.contract_ticker_symbol || "?"})
        <br><code>${t.contract_address}</code>
        <br>Decimals: ${t.contract_decimals ?? "N/A"}
      </div>
    `);
        }
    }

    // Render other fields
    for (const [key, value] of Object.entries(details)) {
        if (["contract_metadata", "token_in", "token_out", "__typename"].includes(key)) continue;
        if (value === null || value === undefined) continue;

        let displayValue = value;
        if (typeof value === "object") {
            displayValue = JSON.stringify(value);
        }

        entries.push(`<div><strong>${formatKey(key)}:</strong> <code>${displayValue}</code></div>`);
    }

    return entries.length > 0 ? entries.join("") : "<em>No details available</em>";
}

/**
 * Format a camelCase or snake_case key for display.
 */
function formatKey(key) {
    return key
        .replace(/_/g, " ")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Format decoded args for display.
 */
function formatArgs(args) {
    const entries = [];
    for (const key of Object.keys(args)) {
        // Skip numeric indices (ethers returns both numeric and named)
        if (/^\d+$/.test(key)) continue;
        let val = args[key];
        if (typeof val === "bigint") {
            val = val.toString();
        } else if (typeof val === "object" && val !== null) {
            val = JSON.stringify(val);
        }
        entries.push(`<div><strong>${key}:</strong> <code>${val}</code></div>`);
    }
    return entries.join("");
}

/**
 * Format Optimistic Oracle args with hex-to-UTF8 decoding for data fields.
 */
function formatOptimisticOracleArgs(args, eventName) {
    const entries = [];
    const keys = Object.keys(args);

    // Check if we only have numeric keys
    const hasNamedKeys = keys.some((key) => !/^\d+$/.test(key));

    // Get parameter names for this event type
    const paramNames = EVENT_PARAMS[eventName] || [];

    for (const key of keys) {
        // Skip numeric indices if we have named keys (ethers returns both)
        if (hasNamedKeys && /^\d+$/.test(key)) continue;

        const val = args[key];
        let displayVal = val;

        // If this is a numeric key, use the parameter name from the mapping
        let fieldName = key;
        let actualFieldName = key;
        if (/^\d+$/.test(key) && paramNames[parseInt(key)]) {
            actualFieldName = paramNames[parseInt(key)];
            fieldName = `${key}: ${actualFieldName}`;
        }

        // Convert BigInt to string
        if (typeof val === "bigint") {
            displayVal = val.toString();
        }
        // Special handling for ancillaryData field - decode bytes to UTF-8
        else if (actualFieldName === "ancillaryData" && typeof val === "string" && val.startsWith("0x")) {
            try {
                const utf8Text = toUtf8String(val);

                if (utf8Text && utf8Text.trim().length > 0) {
                    // Escape HTML to prevent XSS
                    const escapedText = utf8Text
                        .replace(/&/g, "&amp;")
                        .replace(/</g, "&lt;")
                        .replace(/>/g, "&gt;")
                        .replace(/"/g, "&quot;")
                        .replace(/'/g, "&#039;")
                        .replace(/\n/g, "<br>"); // Convert newlines to <br>

                    displayVal = `<div class="hex-decoded">${escapedText}</div><div class="hex-raw"><details><summary>Show Raw Hex</summary><code style="word-break: break-all; font-size: 0.7rem;">${val}</code></details></div>`;
                } else {
                    displayVal = `<code>${val}</code>`;
                }
            } catch (_err) {
                displayVal = `<code>${val}</code>`;
            }
        }
        // Try to decode other hex strings that might contain data
        else if (
            typeof val === "string" &&
            val.startsWith("0x") &&
            val.length > 10 &&
            key.toLowerCase().includes("data")
        ) {
            try {
                const utf8Text = toUtf8String(val);
                if (utf8Text && utf8Text.trim().length > 0 && /[\x20-\x7E]/.test(utf8Text)) {
                    const escapedText = utf8Text
                        .replace(/&/g, "&amp;")
                        .replace(/</g, "&lt;")
                        .replace(/>/g, "&gt;")
                        .replace(/"/g, "&quot;")
                        .replace(/'/g, "&#039;")
                        .replace(/\n/g, "<br>");

                    displayVal = `<div class="hex-decoded">${escapedText}</div>`;
                } else {
                    displayVal = `<code>${val}</code>`;
                }
            } catch {
                displayVal = `<code>${val}</code>`;
            }
        }
        // Handle identifier as UTF-8 bytes32
        else if (actualFieldName === "identifier" && typeof val === "string" && val.startsWith("0x")) {
            try {
                const utf8Text = toUtf8String(val).replace(/\0/g, ""); // Remove null bytes
                if (utf8Text && utf8Text.length > 0) {
                    displayVal = `<code>${utf8Text}</code> <small class="hex-raw">(${val})</small>`;
                } else {
                    displayVal = `<code>${val}</code>`;
                }
            } catch {
                displayVal = `<code>${val}</code>`;
            }
        }
        // Handle objects
        else if (typeof val === "object" && val !== null) {
            displayVal = `<code>${JSON.stringify(val)}</code>`;
        }
        // Handle other hex strings
        else if (typeof val === "string" && val.startsWith("0x")) {
            displayVal = `<code>${val}</code>`;
        }
        // Handle other strings
        else if (typeof val === "string") {
            displayVal = `<code>${val}</code>`;
        }

        entries.push(
            `<div class="arg-entry"><strong>${formatFieldName(fieldName)}:</strong> <div class="arg-value">${displayVal}</div></div>`
        );
    }
    return entries.join("");
}

/**
 * Format field names for better readability
 */
function formatFieldName(name) {
    // Convert camelCase to Title Case
    return name
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (str) => str.toUpperCase())
        .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscription Management
// ─────────────────────────────────────────────────────────────────────────────

async function startSubscription() {
    const walletAddress = walletInput.value.trim().toLowerCase();
    const chainName = chainSelect.value;

    if (!walletAddress || !walletAddress.startsWith("0x")) {
        setStatus("Invalid wallet address", "error");
        return;
    }

    // Stop any existing subscription
    await stopSubscription();

    // Clear events and show skeleton
    eventsEl.innerHTML = "";
    showSkeletonLoading();
    currentWallet = walletAddress;

    // Create new client
    client = createClient({
        url: GOLDRUSH_STREAM_URL,
        connectionParams: {
            GOLDRUSH_API_KEY: GOLDRUSH_API_KEY,
        },
        keepAlive: 30000,
        retryAttempts: 5,
        shouldRetry: () => true,
        on: {
            connected: () => {
                console.log("WebSocket connected");
                setStatus(`Connected to ${chainName} - watching ${walletAddress.slice(0, 10)}...`, "connected");
            },
            closed: () => {
                console.log("WebSocket closed");
                if (currentSubscription) {
                    setStatus("Disconnected", "disconnected");
                }
            },
            error: (err) => {
                console.error("WS error:", err);
                setStatus("Connection error", "error");
            },
        },
    });

    // Update UI
    subscribeBtn.disabled = true;
    stopBtn.disabled = false;
    walletInput.disabled = true;
    chainSelect.disabled = true;
    setStatus("Connecting...", "connecting");

    // Build and execute subscription
    const query = buildSubscriptionQuery(chainName, walletAddress);
    console.log("Starting subscription with query:", query);

    try {
        currentSubscription = client.iterate({ query });

        for await (const result of currentSubscription) {
            const receivedAt = Date.now();
            console.log("Received data:", result);

            if (result.data?.walletTxs) {
                // walletTxs is an array of transactions
                const txs = Array.isArray(result.data.walletTxs) ? result.data.walletTxs : [result.data.walletTxs];

                for (const tx of txs) {
                    try {
                        renderTx(tx, receivedAt, currentWallet);
                    } catch (renderErr) {
                        console.error("Error rendering transaction:", renderErr, tx);
                    }
                }
            }
            if (result.errors) {
                console.error("Subscription errors:", result.errors);
                setStatus("Subscription Error - Check Console", "error");
            }
        }
    } catch (err) {
        if (err.message !== "Subscription was closed") {
            console.error("Subscription failed:", err);
            setStatus(`Error: ${err.message}`, "error");
        }
    }
}

async function stopSubscription() {
    if (currentSubscription) {
        currentSubscription.return();
        currentSubscription = null;
    }
    if (client) {
        client.dispose();
        client = null;
    }
    currentWallet = null;

    // Clear latency metrics
    latencies = [];
    const metricsEl = document.querySelector("#latency-metrics");
    if (metricsEl) {
        metricsEl.innerHTML = "";
    }

    // Update UI
    subscribeBtn.disabled = false;
    stopBtn.disabled = true;
    walletInput.disabled = false;
    chainSelect.disabled = false;
    setStatus("Stopped", "idle");
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Listeners
// ─────────────────────────────────────────────────────────────────────────────

// Preset selector
presetSelect.addEventListener("change", (e) => {
    const presetValue = e.target.value;
    if (presetValue && PRESETS[presetValue]) {
        const preset = PRESETS[presetValue];
        walletInput.value = preset.address;
        chainSelect.value = preset.chain;
    }
});

subscribeBtn.addEventListener("click", startSubscription);
stopBtn.addEventListener("click", stopSubscription);

// Allow Enter key to start subscription
walletInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !subscribeBtn.disabled) {
        startSubscription();
    }
});
