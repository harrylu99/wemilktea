export const momentsImageProcessingConfig = {
  maxSourceBytes: 10 * 1024 * 1024,
  maxSourceDimension: 8000,
  maxSourcePixels: 40_000_000,
  maxOutputLongEdge: 2048,
  outputQuality: 0.85,
  outputType: "image/webp"
} as const;

export class MomentImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MomentImageError";
  }
}

type ImageHeader = { width: number; height: number };

const jpegStartOfFrameMarkers = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf
]);

function uint24(view: DataView, offset: number) {
  return (
    view.getUint8(offset) |
    (view.getUint8(offset + 1) << 8) |
    (view.getUint8(offset + 2) << 16)
  );
}

function readJpegHeader(bytes: Uint8Array): ImageHeader | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) return null;
    if (jpegStartOfFrameMarkers.has(marker) && length >= 7) {
      return {
        height: (bytes[offset + 3] << 8) | bytes[offset + 4],
        width: (bytes[offset + 5] << 8) | bytes[offset + 6]
      };
    }
    offset += length;
  }
  return null;
}

function readWebpHeader(bytes: Uint8Array): ImageHeader | null {
  if (
    bytes.length < 30 ||
    String.fromCharCode(...bytes.slice(0, 4)) !== "RIFF" ||
    String.fromCharCode(...bytes.slice(8, 12)) !== "WEBP"
  )
    return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunk = String.fromCharCode(...bytes.slice(12, 16));
  if (chunk === "VP8X") {
    return { width: uint24(view, 24) + 1, height: uint24(view, 27) + 1 };
  }
  if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    return {
      width: 1 + ((bytes[21] | (bytes[22] << 8)) & 0x3fff),
      height:
        1 +
        (((bytes[22] >> 6) | (bytes[23] << 2) | ((bytes[24] & 0x0f) << 10)) &
          0x3fff)
    };
  }
  if (
    chunk === "VP8 " &&
    bytes.length >= 30 &&
    bytes[23] === 0x9d &&
    bytes[24] === 0x01 &&
    bytes[25] === 0x2a
  ) {
    return {
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff
    };
  }
  return null;
}

export function readMomentImageHeader(bytes: Uint8Array): ImageHeader | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    String.fromCharCode(...bytes.slice(1, 4)) === "PNG" &&
    bytes.length >= 24
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  return readJpegHeader(bytes) ?? readWebpHeader(bytes);
}

export function outputDimensions(width: number, height: number) {
  const scale = Math.min(
    1,
    momentsImageProcessingConfig.maxOutputLongEdge / Math.max(width, height)
  );
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

function assertSafeDimensions(width: number, height: number, label: string) {
  if (
    width < 1 ||
    height < 1 ||
    width > momentsImageProcessingConfig.maxSourceDimension ||
    height > momentsImageProcessingConfig.maxSourceDimension ||
    width * height > momentsImageProcessingConfig.maxSourcePixels
  ) {
    throw new MomentImageError(`${label} dimensions are not supported.`);
  }
}

async function canvasBlob(canvas: HTMLCanvasElement | OffscreenCanvas) {
  if ("convertToBlob" in canvas)
    return canvas.convertToBlob({
      type: momentsImageProcessingConfig.outputType,
      quality: momentsImageProcessingConfig.outputQuality
    });
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(
              new MomentImageError("The normalized image could not be encoded.")
            ),
      momentsImageProcessingConfig.outputType,
      momentsImageProcessingConfig.outputQuality
    );
  });
}

export async function normalizeMomentImage(file: File) {
  if (file.size < 1 || file.size > momentsImageProcessingConfig.maxSourceBytes)
    throw new MomentImageError("Images must be smaller than 10 MB.");
  const header = readMomentImageHeader(
    new Uint8Array(await file.arrayBuffer())
  );
  if (!header)
    throw new MomentImageError("Choose a valid JPEG, PNG, or WebP image.");
  assertSafeDimensions(header.width, header.height, "Source image");

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    assertSafeDimensions(bitmap.width, bitmap.height, "Decoded image");
    const dimensions = outputDimensions(bitmap.width, bitmap.height);
    const canvas =
      typeof OffscreenCanvas === "function"
        ? new OffscreenCanvas(dimensions.width, dimensions.height)
        : document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d") as
      CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!context)
      throw new MomentImageError("The browser cannot render this image.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height);
    const blob = await canvasBlob(canvas);
    if (blob.type !== momentsImageProcessingConfig.outputType)
      throw new MomentImageError(
        "This browser cannot encode normalized WebP images."
      );
    const normalizedFile = new File([blob], "moment.webp", {
      type: momentsImageProcessingConfig.outputType
    });
    return {
      file: normalizedFile,
      width: dimensions.width,
      height: dimensions.height,
      byteSize: normalizedFile.size,
      contentType: momentsImageProcessingConfig.outputType
    } as const;
  } catch (error) {
    if (error instanceof MomentImageError) throw error;
    throw new MomentImageError(
      "The selected file could not be decoded as an image."
    );
  } finally {
    bitmap?.close();
  }
}
