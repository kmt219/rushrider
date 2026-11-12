import type { NodeStreamMessage } from "../types";

// ── JSON decode path (dev / fallback) ─────────────────────────
// When VITE_HL_NODE_WS_URL is not set or the node sends JSON,
// we just parse the envelope's `type` field.
function decodeJson(raw: string): NodeStreamMessage | null {
    try {
        const obj = JSON.parse(raw) as { type: string; payload: unknown };
        if (obj.type === "fills" || obj.type === "trades" || obj.type === "orders" || obj.type === "misc") {
            return obj as NodeStreamMessage;
        }
        return null;
    } catch {
        return null;
    }
}

// ── Protobuf decode path (production node stream) ─────────────
// We use protobufjs to decode binary frames.
// The decoder is loaded lazily on first binary message.
let protoDecoder: ((buf: Uint8Array) => NodeStreamMessage | null) | null = null;

function loadProtoDecoder(): (buf: Uint8Array) => NodeStreamMessage | null {
    if (protoDecoder) return protoDecoder;

    protoDecoder = (_buf: Uint8Array): NodeStreamMessage | null => {
        // eslint-disable-next-line no-console
        console.warn(
            "[stream/decode] Binary protobuf received but decoder not yet configured. " +
                "Generate src/proto/hl_node.json from hl_node.proto and update this function."
        );
        return null;
    };

    return protoDecoder;
}

// ── Public API ────────────────────────────────────────────────
export async function decodeNodeMessage(data: string | ArrayBuffer | Blob): Promise<NodeStreamMessage | null> {
    if (typeof data === "string") {
        return decodeJson(data);
    }

    // Binary frame — use protobuf decoder
    let buf: Uint8Array;
    if (data instanceof ArrayBuffer) {
        buf = new Uint8Array(data);
    } else {
        buf = new Uint8Array(await data.arrayBuffer());
    }

    const decoder = loadProtoDecoder();
    return decoder(buf);
}
