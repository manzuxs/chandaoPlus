// No external extractor/recipe imports needed in background service worker

export async function runChatFromActiveTab({
  chromeApi = chrome,
  gatewayClient,
  workspaceId,
  agent,
  command,
  message
}: any) {
  const tabs = await chromeApi.tabs.query({ active: true, currentWindow: true })
  const tab = tabs[0]
  if (!tab || !tab.id) {
    throw new Error("No active tab found")
  }
  const page = await chromeApi.tabs.sendMessage(tab.id, { type: "CAPTURE_CURRENT_PAGE" })
  return gatewayClient.startStream({
    workspaceId,
    agent,
    command,
    page,
    messages: [{ role: "user", content: message }]
  })
}

if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "CAPTURE_ACTIVE_TAB") {
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        const activeTab = tabs[0]
        if (!activeTab || !activeTab.id) {
          sendResponse({ error: "No active tab found" })
          return
        }

        try {
          const response = await chrome.tabs.sendMessage(activeTab.id, { type: "CAPTURE_CURRENT_PAGE" })
          sendResponse(response)
        } catch (err: any) {
          sendResponse({ error: err.message })
        }
      })
      return true
    }
  })
}

// Enable left-click on extension action icon to open sidepanel directly
if (typeof chrome !== "undefined" && chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
    console.error("Failed to set sidepanel behavior:", err)
  })
}
