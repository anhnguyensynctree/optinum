const store = new Map<string, unknown>();

export const cache = {
  get: async (key: string) => store.get(key) ?? null,
  set: async (key: string, value: unknown) => {
    store.set(key, value);
  },
  delete: async (key: string) => {
    store.delete(key);
  },
};
