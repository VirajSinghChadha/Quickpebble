import { AnimatePresence } from "framer-motion";
import { useShortcuts } from "./hooks/useShortcuts";
import { useContentVisibility, useTabs } from "./hooks/useTabs";
import { useTheme } from "./hooks/useTheme";
import { isPrivateWindow } from "./lib/ipc";
import { selectActive, useStore } from "./store/useStore";
import { NewTabPage } from "./components/NewTabPage";
import { PrivacyCenter } from "./components/PrivacyCenter";
import { QuickActions } from "./components/QuickActions";
import { SettingsPanel } from "./components/SettingsPanel";
import { SummaryDialog } from "./components/SummaryDialog";
import { TabSearch } from "./components/TabSearch";
import { TabStrip } from "./components/TabStrip";
import { Toolbar } from "./components/Toolbar";

export default function App() {
  useTheme();
  useTabs();
  useShortcuts();
  useContentVisibility();
  const overlay = useStore((s) => s.overlay);
  const showNewTab = useStore((s) => !selectActive(s).url);
  const priv = isPrivateWindow();

  return (
    <div className={`flex h-full flex-col bg-bg ${priv ? "dark" : ""}`}>
      <header className="shrink-0 bg-bg" style={{ height: 92 }}>
        <TabStrip />
        <Toolbar />
      </header>
      {/* Page webviews are positioned natively over this region. */}
      <div className="min-h-0 flex-1">
        {showNewTab && (priv ? <PrivateNewTab /> : <NewTabPage />)}
      </div>
      <AnimatePresence>
        {overlay === "palette" && <QuickActions key="palette" />}
        {overlay === "tabsearch" && <TabSearch key="tabsearch" />}
        {overlay === "privacy" && <PrivacyCenter key="privacy" />}
        {overlay === "settings" && <SettingsPanel key="settings" />}
        {overlay === "summary" && <SummaryDialog key="summary" />}
      </AnimatePresence>
    </div>
  );
}

function PrivateNewTab() {
  return (
    <main className="grid h-full place-items-center bg-bg px-6 text-center" aria-label="Private window">
      <div className="max-w-md space-y-3">
        <h1 className="text-2xl font-semibold">Private window</h1>
        <p className="text-text-secondary">
          History, cookies and site data from this window are not saved. Sites you visit, your network and any cloud AI provider you enable can still see your activity.
        </p>
      </div>
    </main>
  );
}
