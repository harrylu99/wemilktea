import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import process from "node:process";
import { URL, fileURLToPath } from "node:url";

const fixtureDirectory = resolve(process.argv[2] ?? "");
if (!fixtureDirectory || fixtureDirectory === resolve(".")) {
  throw new Error(
    "Pass the generated fixture directory as the first argument."
  );
}

const harnessPath = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "browser-normalization.html"
);
const harness = await readFile(harnessPath);
const contentTypes = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp"
};

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  if (requestUrl.pathname === "/") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(harness);
    return;
  }

  if (!requestUrl.pathname.startsWith("/fixtures/")) {
    response.writeHead(404);
    response.end();
    return;
  }

  const requestedName = decodeURIComponent(
    requestUrl.pathname.slice("/fixtures/".length)
  );
  const name = basename(requestedName);
  if (!name || requestedName !== name) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  const filePath = join(fixtureDirectory, name);

  try {
    const contents = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type":
        contentTypes[extname(name).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": contents.byteLength,
      "Cache-Control": "no-store"
    });
    response.end(contents);
  } catch {
    response.writeHead(404);
    response.end();
  }
});

const port = Number(process.argv[3] ?? 8787);
server.listen(port, "127.0.0.1", () => {
  process.stdout.write(
    `WM-108 harness listening at http://127.0.0.1:${port}/\n`
  );
});
