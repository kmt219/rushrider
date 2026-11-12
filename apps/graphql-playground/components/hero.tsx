"use client";

import { ApiKeyForm } from "./api-key-form";
import { Giql } from "./giql";
import "graphiql/style.css";
import { useState } from "react";

export const Hero: React.FC = () => {
    const [apiKey, setApiKey] = useState<string>("");
    const [isApiKeySubmitted, setIsApiKeySubmitted] = useState<boolean>(false);

    if (isApiKeySubmitted && apiKey) {
        return <Giql apiKey={apiKey} />;
    }

    return <ApiKeyForm apiKey={apiKey} setApiKey={setApiKey} setIsApiKeySubmitted={setIsApiKeySubmitted} />;
};
