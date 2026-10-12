/** Save a remote file in the browser or via the desktop native dialog. */

export type DownloadResult = "saved" | "cancelled" | "browser";

type DesktopBridge = {
  api?: {
    save_download: (url: string, name: string) => Promise<boolean>;
  };
};

declare global {
  interface Window {
    pywebview?: DesktopBridge;
  }
}

export async function downloadFile(url: string, name: string): Promise<DownloadResult> {
  const bridge = window.pywebview?.api?.save_download;
  if (bridge) {
    const saved = await bridge(url, name);
    return saved ? "saved" : "cancelled";
  }
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  return "browser";
}
