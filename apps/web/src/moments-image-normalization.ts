export const momentsImageProcessingConfig = {
  maxSourceBytes: 10 * 1024 * 1024,
  maxSourceDimension: 8000,
  maxSourcePixels: 40_000_000,
  maxOutputLongEdge: 2048,
  outputQuality: 0.85,
  outputType: "image/webp"
} as const;

export const momentImageSourceContentTypes = [
  "image/jpeg",
  "image/png",
  "image/webp"
] as const;

export type MomentImageSourceContentType =
  (typeof momentImageSourceContentTypes)[number];

export type NormalizedMomentImage =
  | {
      normalization: "browser";
      file: File;
      width: number;
      height: number;
      byteSize: number;
      contentType: "image/webp";
    }
  | {
      normalization: "server";
      file: File;
      width: number;
      height: number;
      byteSize: number;
      contentType: MomentImageSourceContentType;
    };

export class MomentImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MomentImageError";
  }
}

type ImageHeader = { width: number; height: number };
type DetectedMomentImage = ImageHeader & {
  contentType: MomentImageSourceContentType;
};

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
  const image = readDetectedMomentImage(bytes);
  return image ? { width: image.width, height: image.height } : null;
}

function readDetectedMomentImage(
  bytes: Uint8Array
): DetectedMomentImage | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    String.fromCharCode(...bytes.slice(1, 4)) === "PNG" &&
    bytes.length >= 24
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {
      width: view.getUint32(16),
      height: view.getUint32(20),
      contentType: "image/png"
    };
  }
  const jpeg = readJpegHeader(bytes);
  if (jpeg) return { ...jpeg, contentType: "image/jpeg" };
  const webp = readWebpHeader(bytes);
  return webp ? { ...webp, contentType: "image/webp" } : null;
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

function createMomentCanvas(width: number, height: number) {
  const canvas =
    typeof OffscreenCanvas === "function"
      ? new OffscreenCanvas(width, height)
      : typeof document === "undefined"
        ? null
        : document.createElement("canvas");
  if (!canvas) return null;
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function canvasContext(canvas: HTMLCanvasElement | OffscreenCanvas) {
  return canvas.getContext("2d") as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
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

async function canEncodeMomentImageAsWebp() {
  const canvas = createMomentCanvas(1, 1);
  if (!canvas || !canvasContext(canvas)) return false;
  try {
    const blob = await canvasBlob(canvas);
    return blob.type === momentsImageProcessingConfig.outputType;
  } catch {
    return false;
  }
}

async function decodeFallbackImage(file: File) {
  if (typeof Image !== "function")
    throw new MomentImageError("The browser cannot decode this image.");
  const url = URL.createObjectURL(file);
  try {
    const dimensions = await new Promise<ImageHeader>((resolve, reject) => {
      const image = new Image();
      image.onload = () =>
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () =>
        reject(
          new MomentImageError(
            "The selected file could not be decoded as an image."
          )
        );
      image.src = url;
    });
    assertSafeDimensions(dimensions.width, dimensions.height, "Decoded image");
    return dimensions;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function serverNormalizedImage(
  file: File,
  source: DetectedMomentImage,
  dimensions: ImageHeader
): NormalizedMomentImage {
  return {
    normalization: "server",
    file,
    width: dimensions.width,
    height: dimensions.height,
    byteSize: file.size,
    contentType: source.contentType
  };
}

async function fallbackToServerNormalization(
  file: File,
  source: DetectedMomentImage
) {
  const dimensions = await decodeFallbackImage(file);
  // Keep the validated source bytes intact: the Worker applies EXIF orientation
  // once while it transcodes the fallback candidate to final WebP.
  return serverNormalizedImage(file, source, dimensions);
}

export async function normalizeMomentImage(
  file: File
): Promise<NormalizedMomentImage> {
  if (file.size < 1 || file.size > momentsImageProcessingConfig.maxSourceBytes)
    throw new MomentImageError("Images must be smaller than 10 MB.");
  const source = readDetectedMomentImage(
    new Uint8Array(await file.arrayBuffer())
  );
  if (!source)
    throw new MomentImageError("Choose a valid JPEG, PNG, or WebP image.");
  assertSafeDimensions(source.width, source.height, "Source image");

  if (!(await canEncodeMomentImageAsWebp()))
    return fallbackToServerNormalization(file, source);
  if (typeof createImageBitmap !== "function")
    return fallbackToServerNormalization(file, source);

  let bitmap: ImageBitmap | null = null;
  try {
    try {
      bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image"
      });
    } catch {
      return fallbackToServerNormalization(file, source);
    }
    assertSafeDimensions(bitmap.width, bitmap.height, "Decoded image");
    const dimensions = outputDimensions(bitmap.width, bitmap.height);
    const canvas = createMomentCanvas(dimensions.width, dimensions.height);
    const context = canvas ? canvasContext(canvas) : null;
    if (!canvas || !context)
      return serverNormalizedImage(file, source, {
        width: bitmap.width,
        height: bitmap.height
      });
    try {
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height);
      const blob = await canvasBlob(canvas);
      if (blob.type !== momentsImageProcessingConfig.outputType)
        return serverNormalizedImage(file, source, {
          width: bitmap.width,
          height: bitmap.height
        });
      const normalizedFile = new File([blob], "moment.webp", {
        type: momentsImageProcessingConfig.outputType
      });
      return {
        normalization: "browser",
        file: normalizedFile,
        width: dimensions.width,
        height: dimensions.height,
        byteSize: normalizedFile.size,
        contentType: momentsImageProcessingConfig.outputType
      };
    } catch {
      return serverNormalizedImage(file, source, {
        width: bitmap.width,
        height: bitmap.height
      });
    }
  } finally {
    bitmap?.close();
  }
}
