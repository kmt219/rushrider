interface ExtensionSlotProps {
    active?: boolean;
}

export function ExtensionSlot({ active = false }: ExtensionSlotProps) {
    return <div className={`extension-slot ${active ? "extension-slot--active" : ""}`} data-slot="extension" />;
}
