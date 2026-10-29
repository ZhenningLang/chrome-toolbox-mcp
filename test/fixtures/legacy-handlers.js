// Frozen handler table from 84d39f4:extension/background.js.
export function legacyHandlers(chrome) {
  return {
    query: () => chrome.readingList.query({}),
    add: ({ url, title, hasBeenRead }) => chrome.readingList.addEntry({ url, title, hasBeenRead: Boolean(hasBeenRead) }),
    update: ({ url, title, hasBeenRead }) => {
      const info = { url };
      if (title !== undefined) info.title = title;
      if (hasBeenRead !== undefined) info.hasBeenRead = hasBeenRead;
      return chrome.readingList.updateEntry(info);
    },
    remove: ({ url }) => chrome.readingList.removeEntry({ url }),
  };
}
