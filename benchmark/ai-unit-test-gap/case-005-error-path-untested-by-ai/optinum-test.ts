// Optinum generates this from: changeType=[cascade-change], pattern=[error-path-untested-by-ai]
// Optinum detects that handleFileUpload has 4 return paths (200, 400/413, 415, 500)
// and that the AI test only covers 1. It generates tests for each uncovered branch,
// including explicit status code assertions. The 413 test FAILS — revealing the
// copy-paste bug where status 400 was returned instead of 413.

import { handleFileUpload } from "./ai-code";
import type { StorageService, UploadRequest } from "./ai-code";

const BASE_REQUEST: UploadRequest = {
  fileName: "test.jpg",
  mimeType: "image/jpeg",
  sizeInBytes: 1024 * 100,
  content: Buffer.from("x"),
};

const noopStorage: StorageService = {
  store: jest.fn().mockResolvedValue("file-xyz"),
};

describe("handleFileUpload — Optinum error-path probes", () => {
  it("FAILS: oversized file should return status 413, not 400", async () => {
    // Optinum probes the oversized branch — AI left it untested
    const result = await handleFileUpload(
      { ...BASE_REQUEST, sizeInBytes: 11 * 1024 * 1024 }, // 11 MB > 10 MB limit
      noopStorage,
    );

    expect(result.data).toBeNull();
    expect(result.error).toBe("FILE_TOO_LARGE");
    expect(result.status).toBe(413); // FAILS — code returns 400 (copy-paste bug)
  });

  it("PASSES: unsupported MIME type returns 415", async () => {
    // AI also skipped this — Optinum covers it; happens to pass (no bug here)
    const result = await handleFileUpload(
      { ...BASE_REQUEST, mimeType: "video/mp4" },
      noopStorage,
    );

    expect(result.data).toBeNull();
    expect(result.error).toBe("UNSUPPORTED_TYPE");
    expect(result.status).toBe(415);
  });

  it("PASSES: storage failure returns 500 with STORAGE_ERROR", async () => {
    const failingStorage: StorageService = {
      store: jest.fn().mockRejectedValue(new Error("disk full")),
    };

    const result = await handleFileUpload(BASE_REQUEST, failingStorage);

    expect(result.data).toBeNull();
    expect(result.error).toBe("STORAGE_ERROR");
    expect(result.status).toBe(500);
  });

  it("FAILS: response always conforms to { data, error, status } shape on error", async () => {
    // Verify the error response shape is complete — data must be null not undefined
    const result = await handleFileUpload(
      { ...BASE_REQUEST, sizeInBytes: 20 * 1024 * 1024 },
      noopStorage,
    );

    expect(result).toEqual(
      expect.objectContaining({
        data: null,
        error: expect.any(String),
        status: 413, // FAILS — returns 400
      }),
    );
  });
});
