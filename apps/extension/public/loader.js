(async () => {
  try {
    if (!chrome?.runtime?.id) return;
    const src = chrome.runtime.getURL("src/content/index.js");
    await import(src);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/Extension context invalidated/i.test(message)) return;
    console.error("[chandaoPlus] ESM Loader failed to import content script:", err);
  }
})();
