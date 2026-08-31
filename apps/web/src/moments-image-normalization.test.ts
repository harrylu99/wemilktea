import { describe, expect, test } from "bun:test";
import {
  momentsImageProcessingConfig,
  outputDimensions,
  readMomentImageHeader
} from "./moments-image-normalization";

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
});
