import React from "react";

export type StudioTab =
  | "voiceover"
  | "chat"
  | "live"
  | "transcribe"
  | "music"
  | "pricing";

interface HeaderBarProps {
  activeTab: StudioTab;
  onSelectTab: (tab: StudioTab) => void;
  onRender: () => void;
  isRendering: boolean;
  canRender: boolean;
}

const NAV_ITEMS: Array<{ id: StudioTab; label: string }> = [
  { id: "voiceover", label: "Voiceover" },
  { id: "chat", label: "Script Chat" },
  { id: "transcribe", label: "Transcribe" },
  { id: "music", label: "Music Score" },
  { id: "pricing", label: "Pricing" },
];

export const HeaderBar: React.FC<HeaderBarProps> = ({
  activeTab,
  onSelectTab,
  onRender,
  isRendering,
  canRender,
}) => {
  return (
    <header className="sticky top-0 z-30 border-b border-[#232329] bg-[#0B0B0D]/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-8 px-6 py-4">
        <button
          type="button"
          onClick={() => onSelectTab("voiceover")}
          className="font-display text-xl font-medium tracking-tight text-[#F3F1EC] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D49635] rounded-sm"
        >
          Chronicle Booth
        </button>

        <nav
          aria-label="Studio tools"
          className="hidden md:flex items-center gap-7 text-sm font-medium"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D49635] rounded-sm underline-offset-4 ${
                  isActive
                    ? "text-[#F3F1EC] underline"
                    : "text-[#9A9893] hover:text-[#F3F1EC] hover:underline"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => {
              onSelectTab("voiceover");
              onRender();
            }}
            disabled={isRendering || !canRender}
            className="min-h-[40px] px-5 py-2 rounded-md bg-[#D49635] text-[#0B0B0D] text-sm font-semibold tracking-tight hover:bg-[#E0A648] disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F3F1EC] cursor-pointer"
          >
            {isRendering ? "Creating Audio..." : "Create Voiceover"}
          </button>
        </div>
      </div>
    </header>
  );
};
