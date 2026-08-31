import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import process from "node:process";

function readU16(view, offset, littleEndian = false) {
  return view.getUint16(offset, littleEndian);
}

function readU32(view, offset, littleEndian = false) {
  return view.getUint32(offset, littleEndian);
}

function ascii(bytes, offset, length) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function parseExif(bytes, payloadOffset) {
  const tiffOffset = payloadOffset + 6;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const littleEndian = ascii(bytes, tiffOffset, 2) === "II";
  if (!littleEndian && ascii(bytes, tiffOffset, 2) !== "MM") return null;
  if (readU16(view, tiffOffset + 2, littleEndian) !== 42) return null;

  const tags = {};
  const readDirectory = (directoryOffset, directoryName) => {
    const count = readU16(view, tiffOffset + directoryOffset, littleEndian);
    for (let index = 0; index < count; index += 1) {
      const entry = tiffOffset + directoryOffset + 2 + index * 12;
      const tag = readU16(view, entry, littleEndian);
      const type = readU16(view, entry + 2, littleEndian);
      const itemCount = readU32(view, entry + 4, littleEndian);
      const unitSize =
        type === 1 || type === 2
          ? 1
          : type === 3
            ? 2
            : type === 4
              ? 4
              : type === 5
                ? 8
                : 0;
      const valueSize = unitSize * itemCount;
      const valueOffset =
        valueSize <= 4
          ? entry + 8
          : tiffOffset + readU32(view, entry + 8, littleEndian);
      if (tag === 0x0112)
        tags.orientation = readU16(view, valueOffset, littleEndian);
      if (tag === 0x010f && type === 2)
        tags.make = ascii(bytes, valueOffset, itemCount).replace(/\0+$/, "");
      if (tag === 0x0110 && type === 2)
        tags.model = ascii(bytes, valueOffset, itemCount).replace(/\0+$/, "");
      if (tag === 0x8825 && type === 4)
        readDirectory(readU32(view, valueOffset, littleEndian), "GPS");
      if (directoryName === "GPS" && tag === 0x0001)
        tags.gpsLatitudeRef = ascii(bytes, valueOffset, itemCount).replace(
          /\0+$/,
          ""
        );
      if (directoryName === "GPS" && tag === 0x0003)
        tags.gpsLongitudeRef = ascii(bytes, valueOffset, itemCount).replace(
          /\0+$/,
          ""
        );
      if (directoryName === "GPS" && tag === 0x0002) tags.gpsLatitude = true;
      if (directoryName === "GPS" && tag === 0x0004) tags.gpsLongitude = true;
    }
  };

  const ifd0Offset = readU32(view, tiffOffset + 4, littleEndian);
  readDirectory(ifd0Offset, "IFD0");
  return tags;
}

function inspectJpeg(bytes) {
  const metadata = [];
  let exif = null;
  let hasXmp = false;
  const xmpIdentifier = "http://ns.adobe.com/xap/1.0/";
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
    if (marker === 0xe1 && ascii(bytes, offset + 2, 6) === "Exif\0\0") {
      metadata.push("EXIF");
      exif = parseExif(bytes, offset + 2);
    } else if (
      marker === 0xe1 &&
      ascii(bytes, offset + 2, xmpIdentifier.length) === xmpIdentifier
    ) {
      metadata.push("XMP");
      hasXmp = true;
    } else if (marker >= 0xe0 && marker <= 0xef) {
      metadata.push(`APP${marker - 0xe0}`);
    }
    offset += segmentLength;
  }
  return {
    format: "jpeg",
    metadata,
    exif,
    hasExif: exif !== null,
    hasXmp,
    hasGps: Boolean(exif?.gpsLatitude && exif?.gpsLongitude)
  };
}

function inspectPng(bytes) {
  const metadata = [];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength
    ).getUint32(offset, false);
    const type = ascii(bytes, offset + 4, 4);
    if (["eXIf", "tEXt", "iTXt", "zTXt", "pHYs"].includes(type))
      metadata.push(type);
    offset += 12 + length;
    if (type === "IEND") break;
  }
  return {
    format: "png",
    metadata,
    hasExif: metadata.includes("eXIf"),
    hasXmp: false,
    hasGps: false
  };
}

function inspectWebp(bytes) {
  const chunks = [];
  let offset = 12;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4);
    const length = view.getUint32(offset + 4, true);
    chunks.push(type);
    offset += 8 + length + (length % 2);
  }
  return {
    format: "webp",
    chunks,
    hasExif: chunks.includes("EXIF"),
    hasXmp: chunks.includes("XMP "),
    hasGps: false
  };
}

function inspectBytes(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return inspectJpeg(bytes);
  if (ascii(bytes, 0, 8) === "\x89PNG\r\n\x1a\n") return inspectPng(bytes);
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP")
    return inspectWebp(bytes);
  return {
    format: "unknown",
    metadata: [],
    hasExif: false,
    hasXmp: false,
    hasGps: false
  };
}

function runProbe(path) {
  return new Promise((resolve) => {
    const child = spawn(
      "ffprobe",
      [
        "-hide_banner",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=codec_name,width,height,pix_fmt",
        "-of",
        "json",
        path
      ],
      { stdio: ["ignore", "pipe", "ignore"] }
    );
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.on("close", (code) => {
      let details = null;
      try {
        details = stdout ? JSON.parse(stdout) : null;
      } catch {
        details = null;
      }
      const stream = details?.streams?.[0];
      const validStream =
        code === 0 &&
        typeof stream?.codec_name === "string" &&
        Number.isInteger(stream.width) &&
        Number.isInteger(stream.height) &&
        stream.width > 0 &&
        stream.height > 0;
      resolve({
        ok: validStream,
        details,
        error: validStream
          ? undefined
          : "ffprobe did not identify a positive-dimension image stream"
      });
    });
  });
}

const report = [];
for (const path of process.argv.slice(2)) {
  const bytes = new Uint8Array(await readFile(path));
  report.push({
    path,
    bytes: bytes.byteLength,
    metadata: inspectBytes(bytes),
    decode: await runProbe(path)
  });
}
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
