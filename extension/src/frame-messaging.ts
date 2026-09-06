export async function frameIdsForTab(tabId: number): Promise<number[]> {
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    const ids = [...new Set((frames ?? []).map((frame) => frame.frameId))];
    return ids.length ? ids : [0];
  } catch {
    return [0];
  }
}

export async function sendMessageToFrames<T>(tabId: number, message: unknown): Promise<T[]> {
  const frameIds = await frameIdsForTab(tabId);
  const responses: Array<T | undefined> = await Promise.all(frameIds.map(async (frameId): Promise<T | undefined> => {
    try { return chrome.tabs.sendMessage(tabId, message, { frameId }) as Promise<T>; }
    catch { return undefined; }
  }));
  return responses.filter((response): response is T => response !== undefined);
}
