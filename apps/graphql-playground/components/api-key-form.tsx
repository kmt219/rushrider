"use client";

import { useEffect, useState } from "react";

export const ApiKeyForm: React.FC<{
    apiKey: string;
    setApiKey: React.Dispatch<React.SetStateAction<string>>;
    setIsApiKeySubmitted: React.Dispatch<React.SetStateAction<boolean>>;
}> = ({ apiKey, setApiKey, setIsApiKeySubmitted }) => {
    const [error, setError] = useState<string | null>(null);

    // Token validation patterns from the Java code
    const LEGACY_PATTERN = /^ckey_[a-f0-9]{27}$/;
    const V2_PATTERN = /^cqt_(wF|rQ)[bcdfghjkmpqrtvwxyBCDFGHJKMPQRTVWXY346789]{26}$/;

    const isValidToken = (token: string): boolean => {
        if (!token || token.trim() === "") {
            return false;
        }
        return LEGACY_PATTERN.test(token) || V2_PATTERN.test(token);
    };

    useEffect(() => {
        const storedKey = sessionStorage.getItem("goldrush_apiKey") || "";
        const storedKeyIsValid = isValidToken(storedKey);
        if (storedKeyIsValid) {
            setApiKey(storedKey);
            setIsApiKeySubmitted(true);
        }
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        const trimmedKey = apiKey.trim();

        if (!isValidToken(trimmedKey)) {
            setError("Invalid API key format");
            return;
        }

        setApiKey(trimmedKey);
        setIsApiKeySubmitted(true);

        sessionStorage.setItem("goldrush_apiKey", trimmedKey);
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-900">
            <div className="w-full max-w-sm p-6 pb-2 bg-gray-800 rounded-lg border border-gray-700">
                <div className="mb-4 text-center">
                    <h3 className="text-lg font-medium text-white mb-1">GoldRush API Key</h3>
                    <p className="text-sm text-gray-400">Enter your API key to continue</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-3">
                    <div>
                        <input
                            type="text"
                            placeholder="ckey_... or cqt_..."
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 text-sm"
                            required
                        />
                        {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
                    </div>

                    <button
                        type="submit"
                        className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800"
                    >
                        Connect
                    </button>
                </form>

                <div className="mt-4 pt-3 border-t border-gray-700">
                    <div className="space-y-2 flex justify-evenly">
                        <a
                            href="https://goldrush.dev/platform/apikey"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-center text-xs text-blue-400 hover:text-blue-300 underline"
                        >
                            Get API Key
                        </a>
                        <a
                            href="https://goldrush.dev/docs"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-center text-xs text-gray-400 hover:text-gray-300 underline"
                        >
                            Documentation
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
};
