import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkspace, loadWorkspaces, persistWorkspaces } from "./workspaces";
import { ipc } from "./ipc";
import * as ipcModule from "./ipc";
import { makeTab, useStore } from "../store/useStore";

const storage = () => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
};
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("workspaces", () => {
  it("never reads or writes workspaces in a private window", () => {
    vi.spyOn(ipcModule, "isPrivateWindow").mockReturnValue(true);
    const get = vi.fn();
    const set = vi.fn();
    vi.stubGlobal("localStorage", { getItem: get, setItem: set });
    expect(loadWorkspaces()).toEqual([]);
    expect(() => persistWorkspaces([])).toThrow(/private windows/);
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });
  it("saves groups and pins, excludes blank tabs, and omits transient state", () => {
    const w = createWorkspace("  Research  ", [makeTab(), makeTab({ url: "https://example.com", pinned: true, group: "Work", audible: true })]);
    expect(w.name).toBe("Research");
    expect(w.tabs).toHaveLength(1);
    expect(w.tabs[0]).toMatchObject({ pinned: true, group: "Work" });
    expect(w.tabs[0]).not.toHaveProperty("audible");
    expect(() => createWorkspace("", [makeTab()])).toThrow();
  });
  it("round-trips through storage and rejects unsafe imported URLs", () => {
    storage();
    const w = createWorkspace("Work", [makeTab({ url: "https://example.com" })]);
    persistWorkspaces([w]);
    expect(loadWorkspaces()).toEqual([w]);
    localStorage.setItem("qp.workspaces.v1", JSON.stringify([{ ...w, tabs: [{ url: "javascript:alert(1)" }, { url: "https://safe.com", group: "unknown" }] }]));
    expect(loadWorkspaces()[0].tabs).toEqual([{ url: "https://safe.com", title: "https://safe.com", favicon: "", pinned: false, group: null }]);
    localStorage.setItem("qp.workspaces.v1", "broken");
    expect(loadWorkspaces()).toEqual([]);
  });
  it("reports storage failures rather than claiming success", () => {
    vi.stubGlobal("localStorage", { setItem: () => { throw new Error("full"); } });
    expect(() => persistWorkspaces([])).toThrow(/Could not save/);
  });
  it("restores alongside existing tabs and only loads the selected page", async () => {
    const original = makeTab({ url: "https://original.com" });
    useStore.setState({ tabs: [original], activeId: original.id });
    const create = vi.spyOn(ipc, "tabCreate").mockResolvedValue();
    const navigate = vi.spyOn(ipc, "tabNavigate").mockResolvedValue("https://one.com");
    vi.spyOn(ipc, "tabActivate").mockResolvedValue();
    const pages = [makeTab({ url: "https://one.com", group: "Work" }), makeTab({ url: "https://two.com", pinned: true })];
    expect(await useStore.getState().restoreTabs(pages)).toBe(2);
    await Promise.resolve();
    expect(create).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(useStore.getState().tabs).toHaveLength(3);
    expect(useStore.getState().tabs[0].pinned).toBe(true);
    expect(useStore.getState().tabs.find((t) => t.url === "https://two.com")?.needsLoad).toBe(true);
  });
  it("rolls back created webviews when a batch fails", async () => {
    const original = makeTab();
    useStore.setState({ tabs: [original], activeId: original.id });
    vi.spyOn(ipc, "tabCreate").mockResolvedValueOnce().mockRejectedValueOnce(new Error("failed"));
    const close = vi.spyOn(ipc, "tabClose").mockResolvedValue();
    await expect(useStore.getState().restoreTabs([makeTab({ url: "https://one.com" }), makeTab({ url: "https://two.com" })])).rejects.toThrow("failed");
    expect(close).toHaveBeenCalledTimes(1);
    expect(useStore.getState().tabs).toEqual([original]);
  });
});
