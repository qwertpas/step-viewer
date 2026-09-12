import { chromium } from "@playwright/test";
import { resolve } from "node:path";

const [file, url = "http://127.0.0.1:5173", rounds = "3"] = process.argv.slice(2);
if (!file) throw new Error("Usage: npm run benchmark -- model.step [url] [rounds]");
const browser = await chromium.launch({ executablePath: process.env.BROWSER, headless: !process.env.HEADED });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    const Base = Worker;
    window.Worker = class extends Base {
      constructor(...args) {
        super(...args);
        this.addEventListener("message", ({ data }) => {
          if (data.result?.geometries) {
            window.sample.workerMs = performance.now() - window.sample.start;
            window.sample.cached = Boolean(data.result.cached);
            window.sample.timings = data.result.timings;
            window.sample.stats = data.result.stats;
          }
          if (data.error) window.sample.error = data.error;
        });
      }
    };
    document.addEventListener("change", (event) => {
      if (event.target.id === "file-input") window.sample = { start: performance.now() };
    }, true);
    document.addEventListener("DOMContentLoaded", () => {
      const loading = document.querySelector("#loading");
      new MutationObserver(() => {
        if (loading.hidden && window.sample) window.sample.totalMs = performance.now() - window.sample.start;
      }).observe(loading, { attributes: true, attributeFilter: ["hidden"] });
    });
  });
  const samples = [];
  for (let i = 0; i < Number(rounds); i++) {
    await page.goto(url);
    for (const mode of ["first", "repeat"]) {
      await page.locator("#file-input").setInputFiles(resolve(file));
      await page.waitForFunction(() => window.sample?.totalMs, null, { timeout: 180_000 });
      const sample = await page.evaluate(() => ({ ...window.sample, status: document.querySelector("#status").textContent }));
      if (sample.error) throw new Error(sample.error);
      samples.push({ round: i + 1, mode, ...sample });
      console.log(JSON.stringify(samples.at(-1)));
    }
  }
  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  console.log(JSON.stringify({ browser: browser.version(), file: resolve(file), url,
    firstMs: median(samples.filter(s => s.mode === "first").map(s => s.totalMs)),
    repeatMs: median(samples.filter(s => s.mode === "repeat").map(s => s.totalMs)),
  }));
} finally {
  await browser.close();
}
