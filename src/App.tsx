import { AnimatePresence, MotionConfig } from "framer-motion";
import { useShortcuts } from "./hooks/useShortcuts";
import { useContentVisibility, useTabs } from "./hooks/useTabs";
import { useTheme } from "./hooks/useTheme";
import { useEffect } from "react";
import { ipc, isPrivateWindow, onDownloads, onLoginSeen } from "./lib/ipc";
import { BASE_CHROME, BOOKMARKS_BAR, selectActive, useStore } from "./store/useStore";
import { NewTabPage } from "./components/NewTabPage";
import { PrivacyCenter } from "./components/PrivacyCenter";
import { BookmarksBar } from "./components/BookmarksBar";
import { HttpsPrompt } from "./components/HttpsPrompt";
import { ExtensionsPanel } from "./components/ExtensionsPanel";
import { Library } from "./components/Library";
import { Sidebar } from "./components/Sidebar";
import { QuickActions } from "./components/QuickActions";
import { SettingsPanel } from "./components/SettingsPanel";
import { SummaryDialog } from "./components/SummaryDialog";
import { TabSearch } from "./components/TabSearch";
import { TabStrip } from "./components/TabStrip";
import { Toolbar } from "./components/Toolbar";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { AuthGate } from "./components/AuthGate";
import { useAccount } from "./store/useAccount";

export default function App() {
  useTheme();
  useTabs();
  useShortcuts();
  useContentVisibility();
  const accountStatus = useAccount((s) => s.status);
  useEffect(() => { if (!isPrivateWindow()) void useAccount.getState().init(); else useAccount.setState({ status: "ready" }); }, []);
  // Keep the downloads list live, and open the panel's badge when something starts.
  useEffect(() => {
    let off = () => {};
    void ipc.downloadsList().then((d) => useStore.getState().setDownloads(d));
    void onDownloads((d) => useStore.getState().setDownloads(d)).then((u) => (off = u));
    return () => off();
  }, []);
  // A login was submitted somewhere: open the Passwords panel so the person can choose Save / Not now / Never.
  useEffect(() => {
    let off = () => {};
    void onLoginSeen((e) => {
      useStore.getState().setLoginPrompt({ tabId: e.id, host: e.host, username: e.username });
      useStore.getState().setSidebar("passwords");
    }).then((u) => (off = u));
    return () => off();
  }, []);
  const overlay = useStore((s) => s.overlay);
  const showNewTab = useStore((s) => !selectActive(s).url);
  const priv = isPrivateWindow();
  const bar = useStore((s) => s.bookmarksBar);

  return (
    <MotionConfig reducedMotion="user">
    <div className={`flex h-full flex-col bg-bg ${priv ? "dark" : ""}`}>
      <header className="browser-chrome shrink-0 bg-bg" style={{ height: BASE_CHROME + (bar ? BOOKMARKS_BAR : 0) }}>
        <TabStrip />
        <Toolbar />
        {bar && <BookmarksBar />}
      </header>
      {/* Page webviews are positioned natively over this region. */}
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">{showNewTab && (priv ? <PrivateNewTab /> : <NewTabPage />)}</div>
        <Sidebar />
      </div>
      <AnimatePresence>
        {overlay === "palette" && <QuickActions key="palette" />}
        {overlay === "tabsearch" && <TabSearch key="tabsearch" />}
        {overlay === "privacy" && <PrivacyCenter key="privacy" />}
        {overlay === "settings" && <SettingsPanel key="settings" />}
        {overlay === "summary" && <SummaryDialog key="summary" />}
        {overlay === "extensions" && <ExtensionsPanel key="extensions" />}
        {overlay === "library" && <Library key="library" />}
        {overlay === "https" && <HttpsPrompt key="https" />}
      </AnimatePresence>
      <UpdatePrompt />
      {accountStatus !== "ready" && <AuthGate />}
    </div>
    </MotionConfig>
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
