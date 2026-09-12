import { shareUrl } from "./drive.js";

export function setupSharing(drive) {
  const button = document.querySelector("#share");
  const panel = document.querySelector("#share-panel");
  const message = document.querySelector("#share-message");
  const link = document.querySelector("#share-link");
  const driveLink = document.querySelector("#share-drive");
  let file = null;
  let hash;
  let url = "";
  let loading = false;
  let busy = false;

  function update() {
    button.disabled = !file || loading || busy;
    button.textContent = busy ? "Sharing…" : "Share";
  }

  function report(text) {
    panel.hidden = false;
    message.textContent = text;
  }

  button.addEventListener("click", async () => {
    if (button.disabled) return;
    busy = true;
    update();
    link.hidden = true;
    try {
      if (!url) {
        report("Connecting to Google Drive…");
        await drive.connect();
        const shared = await drive.share(file, report, hash);
        url = shareUrl(window.location.href, shared);
        driveLink.href = `https://drive.google.com/drive/folders/${encodeURIComponent(shared.folderId)}`;
        driveLink.hidden = false;
      }
      link.value = url;
      link.hidden = false;
      try {
        await navigator.clipboard.writeText(url);
        report("Link copied. Anyone with the link can view and download this CAD.");
      } catch {
        report("Link ready. Click Share again, or copy the link below.");
        link.focus();
        link.select();
      }
    } catch (error) {
      report(error.message || "Sharing failed. Please try again.");
    } finally {
      busy = false;
      update();
    }
  });
  link.addEventListener("click", () => link.select());
  document.querySelector("#close-share").addEventListener("click", () => { panel.hidden = true; });

  return {
    get busy() { return busy; },
    setLoading(value) { loading = value; update(); },
    setFile(value, sharedUrl = "", fileHash) {
      file = value;
      hash = fileHash;
      url = sharedUrl;
      driveLink.hidden = true;
      driveLink.href = "";
      panel.hidden = true;
      update();
      if (!url) drive.prepare().catch((error) => report(error.message));
    },
  };
}
