import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";

import serverPackageJson from "../apps/server/package.json" with { type: "json" };

type ArtifactKey = "macArm64Dmg" | "macX64Dmg" | "windowsX64Exe" | "linuxX64AppImage";

type ArtifactDefinition = {
  key: ArtifactKey;
  label: string;
  outputName: string;
  envVar: string;
  contentType: string;
  match: (fileName: string) => boolean;
};

type UploadedArtifact = {
  key: ArtifactKey;
  label: string;
  sourcePath: string;
  pathname: string;
  url: string;
  downloadUrl: string;
  envVar: string;
  envValue: string;
  sha256: string;
  size: number;
  contentType: string;
};

type CliOptions = {
  releaseDir: string;
  prefix: string;
  version: string;
  dryRun: boolean;
  requireAll: boolean;
};

const ARTIFACTS: ArtifactDefinition[] = [
  {
    key: "macArm64Dmg",
    label: "macOS Apple Silicon DMG",
    outputName: "pipper-mac-arm64.dmg",
    envVar: "PUBLIC_PIPPER_MAC_ARM64_DMG_URL",
    contentType: "application/x-apple-diskimage",
    match: (fileName) => fileName.endsWith("-arm64.dmg"),
  },
  {
    key: "macX64Dmg",
    label: "macOS Intel DMG",
    outputName: "pipper-mac-x64.dmg",
    envVar: "PUBLIC_PIPPER_MAC_X64_DMG_URL",
    contentType: "application/x-apple-diskimage",
    match: (fileName) => fileName.endsWith("-x64.dmg"),
  },
  {
    key: "windowsX64Exe",
    label: "Windows x64 installer",
    outputName: "pipper-windows-x64.exe",
    envVar: "PUBLIC_PIPPER_WINDOWS_X64_EXE_URL",
    contentType: "application/vnd.microsoft.portable-executable",
    match: (fileName) => fileName.endsWith(".exe") && /x64|Setup/i.test(fileName),
  },
  {
    key: "linuxX64AppImage",
    label: "Linux x64 AppImage",
    outputName: "pipper-linux-x64.AppImage",
    envVar: "PUBLIC_PIPPER_LINUX_X64_APPIMAGE_URL",
    contentType: "application/octet-stream",
    match: (fileName) => fileName.endsWith(".AppImage") && /x64/i.test(fileName),
  },
];

function printUsage(): never {
  console.error(`Usage: node scripts/upload-desktop-blob.ts [options]

Uploads desktop release artifacts to Vercel Blob using stable latest paths.
Requires BLOB_READ_WRITE_TOKEN in the environment or .env.local.

Options:
  --release-dir <dir>  Local artifact directory (default: release)
  --prefix <path>      Blob pathname prefix (default: desktop/latest)
  --version <version>  Version for manifest/cache-busting (default: apps/server package version)
  --require-all        Fail unless every platform artifact is present
  --dry-run            Print what would upload without writing to Blob
`);
  process.exit(1);
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    releaseDir: "release",
    prefix: "desktop/latest",
    version: serverPackageJson.version,
    dryRun: false,
    requireAll: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) printUsage();
      index += 1;
      return value;
    };

    switch (arg) {
      case "--release-dir":
        options.releaseDir = next();
        break;
      case "--prefix":
        options.prefix = next();
        break;
      case "--version":
        options.version = next();
        break;
      case "--require-all":
        options.requireAll = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--help":
      case "-h":
        printUsage();
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        printUsage();
    }
  }

  options.prefix = options.prefix.replace(/^\/+|\/+$/g, "");
  return options;
}

async function loadDotenvLocal(): Promise<void> {
  const envPath = path.resolve(".env.local");
  let contents: string;
  try {
    contents = await readFile(envPath, "utf8");
  } catch {
    return;
  }

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    createReadStream(filePath)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", resolve);
  });
  return hash.digest("hex");
}

async function findArtifact(
  releaseDir: string,
  definition: ArtifactDefinition,
): Promise<string | undefined> {
  const entries = await readdir(releaseDir, { withFileTypes: true });
  const matches = entries
    .filter((entry) => entry.isFile() && definition.match(entry.name))
    .map((entry) => path.join(releaseDir, entry.name));

  if (matches.length === 0) return undefined;
  if (matches.length === 1) return matches[0];

  const matchesWithStats = await Promise.all(
    matches.map(async (filePath) => ({ filePath, stats: await stat(filePath) })),
  );
  matchesWithStats.sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs);
  return matchesWithStats[0]?.filePath;
}

function withVersionQuery(url: string, version: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("v", version);
  return parsed.toString();
}

async function uploadTextBlob(
  pathname: string,
  body: string,
  contentType: string,
  options: CliOptions,
) {
  if (options.dryRun) {
    console.log(`[dry-run] would upload ${pathname}`);
    return undefined;
  }

  return put(pathname, body, {
    access: "public",
    allowOverwrite: true,
    addRandomSuffix: false,
    cacheControlMaxAge: 60,
    contentType,
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await loadDotenvLocal();

  if (!options.dryRun && !process.env.BLOB_READ_WRITE_TOKEN && !process.env.VERCEL_OIDC_TOKEN) {
    throw new Error(
      "Missing BLOB_READ_WRITE_TOKEN. Run `vercel env pull .env.local --yes` or export the token before uploading.",
    );
  }

  const releaseDir = path.resolve(options.releaseDir);
  const foundArtifacts = await Promise.all(
    ARTIFACTS.map(async (definition) => ({
      definition,
      sourcePath: await findArtifact(releaseDir, definition),
    })),
  );

  const missing = foundArtifacts.filter(({ sourcePath }) => !sourcePath);
  if (options.requireAll && missing.length > 0) {
    throw new Error(
      `Missing required artifacts: ${missing.map(({ definition }) => definition.label).join(", ")}`,
    );
  }

  const present = foundArtifacts.filter(
    (artifact): artifact is { definition: ArtifactDefinition; sourcePath: string } =>
      Boolean(artifact.sourcePath),
  );
  if (present.length === 0) {
    throw new Error(`No desktop artifacts found in ${releaseDir}`);
  }

  if (missing.length > 0) {
    console.warn(
      `Skipping missing artifacts: ${missing.map(({ definition }) => definition.label).join(", ")}`,
    );
  }

  const uploaded: UploadedArtifact[] = [];

  for (const { definition, sourcePath } of present) {
    const pathname = `${options.prefix}/${definition.outputName}`;
    const [{ size }, sha256] = await Promise.all([stat(sourcePath), hashFile(sourcePath)]);

    console.log(`Uploading ${definition.label}: ${sourcePath} -> ${pathname}`);

    if (options.dryRun) {
      uploaded.push({
        key: definition.key,
        label: definition.label,
        sourcePath,
        pathname,
        url: `https://example.blob.vercel-storage.com/${pathname}`,
        downloadUrl: `https://example.blob.vercel-storage.com/${pathname}?download=1`,
        envVar: definition.envVar,
        envValue: `https://example.blob.vercel-storage.com/${pathname}?download=1&v=${options.version}`,
        sha256,
        size,
        contentType: definition.contentType,
      });
      continue;
    }

    const blob = await put(pathname, createReadStream(sourcePath), {
      access: "public",
      allowOverwrite: true,
      addRandomSuffix: false,
      cacheControlMaxAge: 60,
      contentType: definition.contentType,
      multipart: true,
    });

    uploaded.push({
      key: definition.key,
      label: definition.label,
      sourcePath,
      pathname,
      url: blob.url,
      downloadUrl: blob.downloadUrl,
      envVar: definition.envVar,
      envValue: withVersionQuery(blob.downloadUrl, options.version),
      sha256,
      size,
      contentType: blob.contentType,
    });
  }

  const releasedAt = new Date().toISOString();
  const manifest = {
    version: options.version,
    channel: "latest",
    releasedAt,
    artifacts: Object.fromEntries(
      uploaded.map((artifact) => [
        artifact.key,
        {
          label: artifact.label,
          pathname: artifact.pathname,
          url: artifact.url,
          downloadUrl: artifact.downloadUrl,
          sha256: artifact.sha256,
          size: artifact.size,
          contentType: artifact.contentType,
        },
      ]),
    ),
  };
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
  const sha256Sums = `${uploaded
    .map((artifact) => `${artifact.sha256}  ${path.basename(artifact.pathname)}`)
    .join("\n")}\n`;

  await writeFile(path.join(releaseDir, "manifest.latest.json"), manifestJson);
  await writeFile(path.join(releaseDir, "SHA256SUMS.latest.txt"), sha256Sums);

  const manifestBlob = await uploadTextBlob(
    `${options.prefix}/manifest.json`,
    manifestJson,
    "application/json; charset=utf-8",
    options,
  );
  const checksumsBlob = await uploadTextBlob(
    `${options.prefix}/SHA256SUMS.txt`,
    sha256Sums,
    "text/plain; charset=utf-8",
    options,
  );

  console.log("\nUploaded artifacts:");
  for (const artifact of uploaded) {
    console.log(`- ${artifact.label}: ${artifact.downloadUrl}`);
    console.log(`  sha256: ${artifact.sha256}`);
  }
  if (manifestBlob) console.log(`- manifest: ${manifestBlob.url}`);
  if (checksumsBlob) console.log(`- checksums: ${checksumsBlob.url}`);

  console.log("\nSet these marketing env vars:");
  console.log(`PUBLIC_PIPPER_DOWNLOAD_VERSION=${options.version}`);
  for (const artifact of uploaded) {
    console.log(`${artifact.envVar}=${artifact.envValue}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
