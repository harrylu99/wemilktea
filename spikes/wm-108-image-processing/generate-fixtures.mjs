import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import process from "node:process";

const requestedDirectory = process.argv[2];
const outputDirectory =
  requestedDirectory ?? (await mkdtemp(join(tmpdir(), "wm108-fixtures-")));
await mkdir(outputDirectory, { recursive: true });

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}: ${stderr}`));
    });
  });
}

async function ffmpeg(args) {
  await run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args]);
}

function writeU16(view, offset, value) {
  view.setUint16(offset, value, false);
}

function writeU32(view, offset, value) {
  view.setUint32(offset, value, false);
}

function writeAscii(bytes, offset, value) {
  for (let index = 0; index < value.length; index += 1)
    bytes[offset + index] = value.charCodeAt(index);
}

function buildExifApp1() {
  const make = "WM108 Test Camera\0";
  const model = "Synthetic Fixture\0";
  const ifd0Offset = 8;
  const ifd0EntryCount = 4;
  const ifd0End = ifd0Offset + 2 + ifd0EntryCount * 12 + 4;
  const makeOffset = ifd0End;
  const modelOffset = makeOffset + make.length;
  const gpsOffset = modelOffset + model.length;
  const gpsEntryCount = 5;
  const gpsEnd = gpsOffset + 2 + gpsEntryCount * 12 + 4;
  const latitudeOffset = gpsEnd;
  const longitudeOffset = latitudeOffset + 3 * 8;
  const tiff = new Uint8Array(longitudeOffset + 3 * 8);
  const view = new DataView(tiff.buffer);

  writeAscii(tiff, 0, "MM");
  writeU16(view, 2, 42);
  writeU32(view, 4, ifd0Offset);
  writeU16(view, ifd0Offset, ifd0EntryCount);

  let entry = ifd0Offset + 2;
  writeU16(view, entry, 0x0112);
  writeU16(view, entry + 2, 3);
  writeU32(view, entry + 4, 1);
  writeU16(view, entry + 8, 6);
  entry += 12;
  writeU16(view, entry, 0x010f);
  writeU16(view, entry + 2, 2);
  writeU32(view, entry + 4, make.length);
  writeU32(view, entry + 8, makeOffset);
  entry += 12;
  writeU16(view, entry, 0x0110);
  writeU16(view, entry + 2, 2);
  writeU32(view, entry + 4, model.length);
  writeU32(view, entry + 8, modelOffset);
  entry += 12;
  writeU16(view, entry, 0x8825);
  writeU16(view, entry + 2, 4);
  writeU32(view, entry + 4, 1);
  writeU32(view, entry + 8, gpsOffset);
  writeU32(view, ifd0End - 4, 0);
  writeAscii(tiff, makeOffset, make);
  writeAscii(tiff, modelOffset, model);

  writeU16(view, gpsOffset, gpsEntryCount);
  entry = gpsOffset + 2;
  writeU16(view, entry, 0x0000);
  writeU16(view, entry + 2, 1);
  writeU32(view, entry + 4, 4);
  tiff.set([2, 3, 0, 0], entry + 8);
  entry += 12;
  writeU16(view, entry, 0x0001);
  writeU16(view, entry + 2, 2);
  writeU32(view, entry + 4, 2);
  tiff.set([0x53, 0, 0, 0], entry + 8);
  entry += 12;
  writeU16(view, entry, 0x0002);
  writeU16(view, entry + 2, 5);
  writeU32(view, entry + 4, 3);
  writeU32(view, entry + 8, latitudeOffset);
  entry += 12;
  writeU16(view, entry, 0x0003);
  writeU16(view, entry + 2, 2);
  writeU32(view, entry + 4, 2);
  tiff.set([0x45, 0, 0, 0], entry + 8);
  entry += 12;
  writeU16(view, entry, 0x0004);
  writeU16(view, entry + 2, 5);
  writeU32(view, entry + 4, 3);
  writeU32(view, entry + 8, longitudeOffset);
  writeU32(view, gpsEnd - 4, 0);

  const rationals = [36, 1, 51, 1, 0, 1, 174, 1, 45, 1, 0, 1];
  rationals.forEach((value, index) =>
    writeU32(view, latitudeOffset + index * 4, value)
  );

  const payload = new Uint8Array(6 + tiff.length);
  writeAscii(payload, 0, "Exif\0\0");
  payload.set(tiff, 6);
  const segment = new Uint8Array(4 + payload.length);
  segment.set([0xff, 0xe1], 0);
  const segmentLength = payload.length + 2;
  segment[2] = (segmentLength >> 8) & 0xff;
  segment[3] = segmentLength & 0xff;
  segment.set(payload, 4);
  return segment;
}

function buildXmpApp1() {
  const identifier = "http://ns.adobe.com/xap/1.0/\0";
  const packet =
    '<x:xmpmeta xmlns:x="adobe:ns:meta/" data-wm108="synthetic"></x:xmpmeta>\0';
  const payload = new Uint8Array(identifier.length + packet.length);
  writeAscii(payload, 0, identifier);
  writeAscii(payload, identifier.length, packet);
  const segment = new Uint8Array(4 + payload.length);
  segment.set([0xff, 0xe1], 0);
  const segmentLength = payload.length + 2;
  segment[2] = (segmentLength >> 8) & 0xff;
  segment[3] = segmentLength & 0xff;
  segment.set(payload, 4);
  return segment;
}

async function addExif(inputPath, outputPath) {
  const source = new Uint8Array(await readFile(inputPath));
  if (source[0] !== 0xff || source[1] !== 0xd8)
    throw new Error("Expected a JPEG SOI marker.");
  const segment = buildExifApp1();
  const output = new Uint8Array(source.length + segment.length);
  output.set(source.subarray(0, 2), 0);
  output.set(segment, 2);
  output.set(source.subarray(2), segment.length + 2);
  await writeFile(outputPath, output);
}

async function addXmp(inputPath, outputPath) {
  const source = new Uint8Array(await readFile(inputPath));
  if (source[0] !== 0xff || source[1] !== 0xd8)
    throw new Error("Expected a JPEG SOI marker.");
  const segment = buildXmpApp1();
  const output = new Uint8Array(source.length + segment.length);
  output.set(source.subarray(0, 2), 0);
  output.set(segment, 2);
  output.set(source.subarray(2), segment.length + 2);
  await writeFile(outputPath, output);
}

const normalJpeg = join(outputDirectory, "normal-photo.jpg");
const largeLandscape = join(outputDirectory, "large-landscape.jpg");
const largePortrait = join(outputDirectory, "large-portrait.jpg");
const alphaPng = join(outputDirectory, "transparent.png");
const webp = join(outputDirectory, "photo.webp");
const orientationBase = join(outputDirectory, "orientation-base.jpg");
const orientationExif = join(outputDirectory, "orientation-exif.jpg");
const malformed = join(outputDirectory, "photo.jpg");

await ffmpeg([
  "-f",
  "lavfi",
  "-i",
  "testsrc2=size=1600x1200:rate=1",
  "-frames:v",
  "1",
  "-q:v",
  "3",
  normalJpeg
]);
await ffmpeg([
  "-f",
  "lavfi",
  "-i",
  "testsrc2=size=4032x3024:rate=1",
  "-frames:v",
  "1",
  "-q:v",
  "3",
  largeLandscape
]);
await ffmpeg([
  "-f",
  "lavfi",
  "-i",
  "testsrc2=size=3024x4032:rate=1",
  "-frames:v",
  "1",
  "-q:v",
  "3",
  largePortrait
]);
await ffmpeg([
  "-f",
  "lavfi",
  "-i",
  "color=c=black@0.0:s=800x600,format=rgba,drawbox=x=100:y=100:w=600:h=400:color=red@1:t=fill:replace=1",
  "-frames:v",
  "1",
  alphaPng
]);
await run("cwebp", ["-quiet", "-q", "85", normalJpeg, "-o", webp]);
await ffmpeg([
  "-f",
  "lavfi",
  "-i",
  "color=c=red:s=200x150:r=1",
  "-f",
  "lavfi",
  "-i",
  "color=c=green:s=200x150:r=1",
  "-f",
  "lavfi",
  "-i",
  "color=c=blue:s=200x150:r=1",
  "-f",
  "lavfi",
  "-i",
  "color=c=yellow:s=200x150:r=1",
  "-filter_complex",
  "[0][1]hstack=inputs=2[top];[2][3]hstack=inputs=2[bottom];[top][bottom]vstack=inputs=2,format=yuvj420p[out]",
  "-map",
  "[out]",
  "-frames:v",
  "1",
  "-q:v",
  "2",
  orientationBase
]);
await addExif(orientationBase, orientationExif);
await addXmp(orientationExif, orientationExif);
await writeFile(malformed, "this is not a JPEG\n");

process.stdout.write(
  JSON.stringify(
    {
      outputDirectory,
      fixtures: [
        "normal-photo.jpg",
        "transparent.png",
        "photo.webp",
        "large-landscape.jpg",
        "large-portrait.jpg",
        "orientation-exif.jpg",
        "photo.jpg"
      ]
    },
    null,
    2
  ) + "\n"
);
