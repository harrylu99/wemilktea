import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  MomentImageError,
  momentsImageProcessingConfig,
  normalizeMomentImage,
  outputDimensions,
  readMomentImageHeader
} from "./moments-image-normalization";

const browserGlobals = ["OffscreenCanvas", "createImageBitmap", "Image"];
const originalGlobals = new Map(
  browserGlobals.map((name) => [
    name,
    Object.getOwnPropertyDescriptor(globalThis, name)
  ])
);
const originalCreateObjectURL = Object.getOwnPropertyDescriptor(
  URL,
  "createObjectURL"
);
const originalRevokeObjectURL = Object.getOwnPropertyDescriptor(
  URL,
  "revokeObjectURL"
);

let canvasBlobs: Blob[] = [];
let canvasRequests: Array<{ type?: string; quality?: number }> = [];
let drawImage = mock(() => undefined);

function setGlobal(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value,
    writable: true
  });
}

function restoreProperty(
  target: object,
  name: string,
  descriptor: PropertyDescriptor | undefined
) {
  if (descriptor) Object.defineProperty(target, name, descriptor);
  else Reflect.deleteProperty(target, name);
}

class TestOffscreenCanvas {
  width = 0;
  height = 0;

  getContext() {
    return {
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
      drawImage
    };
  }

  async convertToBlob(options: { type?: string; quality?: number }) {
    canvasRequests.push(options);
    return canvasBlobs.shift() ?? new Blob(["webp"], { type: "image/webp" });
  }
}

function pngHeader(width: number, height: number) {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function webpVp8xHeader(width: number, height: number) {
  const bytes = new Uint8Array(30);
  bytes.set(
    [..."RIFF"].map((character) => character.charCodeAt(0)),
    0
  );
  bytes.set(
    [..."WEBP"].map((character) => character.charCodeAt(0)),
    8
  );
  bytes.set(
    [..."VP8X"].map((character) => character.charCodeAt(0)),
    12
  );
  const view = new DataView(bytes.buffer);
  view.setUint32(16, 10, true);
  bytes[24] = (width - 1) & 0xff;
  bytes[25] = ((width - 1) >> 8) & 0xff;
  bytes[26] = (width - 1) >> 16;
  bytes[27] = (height - 1) & 0xff;
  bytes[28] = ((height - 1) >> 8) & 0xff;
  bytes[29] = (height - 1) >> 16;
  return bytes;
}

function installCanvas(...blobs: Blob[]) {
  canvasBlobs = [...blobs];
  setGlobal("OffscreenCanvas", TestOffscreenCanvas);
}

function installFallbackDecoder(
  width: number,
  height: number,
  shouldFail = false
) {
  setGlobal(
    "Image",
    class {
      naturalWidth = width;
      naturalHeight = height;
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => {
          if (shouldFail) this.onerror?.();
          else this.onload?.();
        });
      }
    }
  );
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: mock(() => "blob:moment-source"),
    writable: true
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: mock(() => undefined),
    writable: true
  });
}

afterEach(() => {
  for (const name of browserGlobals)
    restoreProperty(globalThis, name, originalGlobals.get(name));
  restoreProperty(URL, "createObjectURL", originalCreateObjectURL);
  restoreProperty(URL, "revokeObjectURL", originalRevokeObjectURL);
  canvasBlobs = [];
  canvasRequests = [];
  drawImage = mock(() => undefined);
});

describe("Moments image normalization guards", () => {
  test("reads PNG and WebP dimensions without trusting MIME or filename", () => {
    expect(readMomentImageHeader(pngHeader(800, 600))).toEqual({
      width: 800,
      height: 600
    });
    expect(readMomentImageHeader(webpVp8xHeader(2048, 1536))).toEqual({
      width: 2048,
      height: 1536
    });
    expect(
      readMomentImageHeader(new TextEncoder().encode("not an image"))
    ).toBeNull();
  });

  test("uses the approved long-edge limit for both orientations", () => {
    expect(outputDimensions(4032, 3024)).toEqual({ width: 2048, height: 1536 });
    expect(outputDimensions(3024, 4032)).toEqual({ width: 1536, height: 2048 });
    expect(outputDimensions(1600, 1200)).toEqual({ width: 1600, height: 1200 });
  });

  test("keeps the WM-108 safety limits explicit", () => {
    expect(momentsImageProcessingConfig.maxSourceBytes).toBe(10 * 1024 * 1024);
    expect(momentsImageProcessingConfig.maxSourcePixels).toBe(40_000_000);
    expect(momentsImageProcessingConfig.maxSourceDimension).toBe(8000);
    expect(momentsImageProcessingConfig.outputType).toBe("image/webp");
  });

  test("normalizes a valid image with EXIF-aware decoding when WebP encoding works", async () => {
    installCanvas(
      new Blob(["probe"], { type: "image/webp" }),
      new Blob(["normalized"], { type: "image/webp" })
    );
    const close = mock(() => undefined);
    const createBitmap = mock(async () => ({
      width: 300,
      height: 400,
      close
    }));
    setGlobal("createImageBitmap", createBitmap);
    const source = new File([pngHeader(400, 300)], "portrait.jpg", {
      type: "image/jpeg"
    });

    const normalized = await normalizeMomentImage(source);

    expect(normalized).toMatchObject({
      normalization: "browser",
      contentType: "image/webp",
      width: 300,
      height: 400
    });
    expect(createBitmap).toHaveBeenCalledWith(source, {
      imageOrientation: "from-image"
    });
    expect(canvasRequests).toEqual([
      {
        type: "image/webp",
        quality: momentsImageProcessingConfig.outputQuality
      },
      {
        type: "image/webp",
        quality: momentsImageProcessingConfig.outputQuality
      }
    ]);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  test("uses the server fallback when the selected canvas cannot encode WebP", async () => {
    installCanvas(new Blob(["png fallback"], { type: "image/png" }));
    const createBitmap = mock(async () => ({ width: 1, height: 1 }));
    setGlobal("createImageBitmap", createBitmap);
    installFallbackDecoder(300, 400);
    const source = new File([pngHeader(400, 300)], "portrait.png", {
      type: "image/png"
    });

    const normalized = await normalizeMomentImage(source);

    expect(normalized).toEqual({
      normalization: "server",
      file: source,
      width: 300,
      height: 400,
      byteSize: source.size,
      contentType: "image/png"
    });
    expect(createBitmap).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:moment-source");
  });

  test("falls back when createImageBitmap is unavailable after validating the source", async () => {
    installCanvas(new Blob(["probe"], { type: "image/webp" }));
    setGlobal("createImageBitmap", undefined);
    installFallbackDecoder(300, 400);
    const source = new File([pngHeader(400, 300)], "portrait.png", {
      type: "image/png"
    });

    const normalized = await normalizeMomentImage(source);

    expect(normalized).toMatchObject({
      normalization: "server",
      contentType: "image/png",
      width: 300,
      height: 400
    });
  });

  test("keeps a valid-header decode failure as a clear image error", async () => {
    installCanvas(new Blob(["probe"], { type: "image/webp" }));
    setGlobal(
      "createImageBitmap",
      mock(async () => Promise.reject())
    );
    installFallbackDecoder(0, 0, true);

    await expect(
      normalizeMomentImage(
        new File([pngHeader(400, 300)], "corrupt.png", { type: "image/png" })
      )
    ).rejects.toEqual(
      new MomentImageError(
        "The selected file could not be decoded as an image."
      )
    );
  });

  test("rejects corrupt sources and keeps byte and dimension guards before decoding", async () => {
    const createBitmap = mock(async () => ({ width: 1, height: 1 }));
    setGlobal("createImageBitmap", createBitmap);

    await expect(
      normalizeMomentImage(new File(["not an image"], "photo.jpg"))
    ).rejects.toEqual(
      new MomentImageError("Choose a valid JPEG, PNG, or WebP image.")
    );
    await expect(
      normalizeMomentImage(
        new File(
          [new Uint8Array(momentsImageProcessingConfig.maxSourceBytes + 1)],
          "large.png",
          { type: "image/png" }
        )
      )
    ).rejects.toEqual(
      new MomentImageError("Images must be smaller than 10 MB.")
    );
    await expect(
      normalizeMomentImage(
        new File([pngHeader(8001, 1)], "wide.png", { type: "image/png" })
      )
    ).rejects.toEqual(
      new MomentImageError("Source image dimensions are not supported.")
    );
    expect(createBitmap).not.toHaveBeenCalled();
  });
});
