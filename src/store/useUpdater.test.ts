import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipc, type UpdateProgress } from "../lib/ipc";
import { useUpdater } from "./useUpdater";

vi.mock("../lib/ipc", () => ({ ipc: { updateCheck: vi.fn(), updateInstall: vi.fn() } }));
const info = { version: "1.1.0", current: "1.0.0", notes: "New features" };
beforeEach(() => {
  vi.resetAllMocks();
  useUpdater.setState({ state: "idle", info: null, error: null, progress: null, percent: null });
});
describe("in-app updates", () => {
  it("retains automatic update notices and release notes", () => {
    useUpdater.getState().available(info);
    expect(useUpdater.getState()).toMatchObject({ state: "found", info });
  });
  it("clears the notification when no update is available", async () => {
    useUpdater.getState().available(info);
    vi.mocked(ipc.updateCheck).mockResolvedValue(null);
    await useUpdater.getState().check();
    expect(useUpdater.getState()).toMatchObject({ state: "none", info: null });
  });
  it("blocks overlapping checks", async () => {
    let resolve!: (v: typeof info) => void;
    vi.mocked(ipc.updateCheck).mockReturnValue(new Promise((r) => { resolve = r; }));
    const checking = useUpdater.getState().check();
    await useUpdater.getState().check();
    expect(ipc.updateCheck).toHaveBeenCalledTimes(1);
    resolve(info); await checking;
  });
  it("keeps progress across panel remounts and blocks duplicate installation", async () => {
    let progress!: (p: UpdateProgress) => void;
    let resolve!: () => void;
    vi.mocked(ipc.updateInstall).mockImplementation((cb) => {
      progress = cb; return new Promise<void>((r) => { resolve = r; });
    });
    useUpdater.getState().available(info);
    const installing = useUpdater.getState().install();
    progress({ phase: "downloading", downloaded: 25, total: 100 });
    expect(useUpdater.getState().percent).toBe(25);
    await useUpdater.getState().install(); await useUpdater.getState().check();
    useUpdater.getState().available({ ...info, version: "1.2.0" });
    expect(ipc.updateInstall).toHaveBeenCalledTimes(1);
    expect(ipc.updateCheck).not.toHaveBeenCalled();
    expect(useUpdater.getState().info).toEqual(info);
    progress({ phase: "downloading", downloaded: 150, total: 100 });
    expect(useUpdater.getState().percent).toBe(100);
    progress({ phase: "installing", downloaded: 150, total: null });
    expect(useUpdater.getState().percent).toBeNull();
    resolve(); await installing;
  });
  it("preserves the update for retry after download or signature failure", async () => {
    useUpdater.getState().available(info);
    vi.mocked(ipc.updateInstall).mockRejectedValueOnce(new Error("Signature verification failed"));
    await useUpdater.getState().install();
    expect(useUpdater.getState()).toMatchObject({ state: "error", info, progress: null });
    expect(useUpdater.getState().error).toContain("Signature verification failed");
    vi.mocked(ipc.updateInstall).mockResolvedValue();
    await useUpdater.getState().install();
    expect(ipc.updateInstall).toHaveBeenCalledTimes(2);
  });
});
