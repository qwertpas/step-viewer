import { shareUrl } from "./drive.js";

export function setupSharing(drive) {
  const button = document.querySelector("#share");
  const note = document.querySelector("#share-note");
  const panel = document.querySelector("#share-panel");
  const message = document.querySelector("#share-message");
  const link = document.querySelector("#share-link");
  const setup = document.querySelector("#share-setup");
  let file = null;
  let url = "";
  let loading = false;
  let busy = false;

  function update() {
    button.disabled = !file || loading || busy;
    button.textContent = busy ? "Sharing…" : "Copy share link";
    note.hidden = !file;
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
    setup.hidden = Boolean(drive.clientId && drive.apiKey);
    try {
      if (!url) {
        report("Connecting to Google Drive…");
        await drive.connect();
        const shared = await drive.share(file, report);
        url = shareUrl(window.location.href, shared);
      }
      link.value = url;
      link.hidden = false;
      try {
        await navigator.clipboard.writeText(url);
        report("Link copied. Anyone with the link can view and download this CAD.");
      } catch {
        report("Link ready. Click Copy share link again, or copy the link below.");
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
    setFile(value, sharedUrl = "") {
      file = value;
      url = sharedUrl;
      panel.hidden = true;
      update();
      if (!url) drive.prepare().catch((error) => report(error.message));
    },
  };
}
