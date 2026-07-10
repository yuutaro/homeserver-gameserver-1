#!/usr/bin/env node
import { createWriteStream, promises as fs } from 'node:fs';
import { basename, join } from 'node:path';

function usage(message) {
  if (message) console.error(message);
  console.error(
    [
      'Usage: modsync.mjs --csv <path> --out <dir> [--mc <version>] [--loader <forge|fabric|quilt|neoforge>]',
      '',
      'Reads Prism Launcher exported modlist CSV with 3 columns:',
      '  <name>,<url>,<version>',
      '',
      'Downloads mod jars into --out (e.g., ./data/mc-forge-1-20-1/mods).',
    ].join('\n'),
  );
  process.exit(2);
}

function parseArgs(argv) {
  const args = new Map();
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) usage(`Unknown arg: ${a}`);
    const key = a.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) usage(`Missing value for --${key}`);
    args.set(key, value);
    i++;
  }
  const csv = args.get('csv');
  const out = args.get('out');
  const mc = args.get('mc') ?? '1.20.1';
  const loader = (args.get('loader') ?? 'forge').toLowerCase();
  if (!csv) usage('Missing --csv');
  if (!out) usage('Missing --out');
  return { csv, out, mc, loader };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ',') {
      row.push(field);
      field = '';
      continue;
    }

    if (ch === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      continue;
    }

    if (ch === '\r') continue;
    field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function modrinthProjectIdFromUrl(url) {
  const m = url.match(/^https?:\/\/modrinth\.com\/mod\/([^/?#]+)/i);
  if (!m) return null;
  return m[1];
}

function curseforgeIdOrSlugFromUrl(url) {
  const byProjectId = url.match(/^https?:\/\/www\.curseforge\.com\/projects\/(\d+)/i);
  if (byProjectId) return { kind: 'id', value: byProjectId[1] };
  const byMcModsSlug = url.match(/^https?:\/\/www\.curseforge\.com\/minecraft\/mc-mods\/([^/?#]+)/i);
  if (byMcModsSlug) return { kind: 'slug', value: byMcModsSlug[1] };
  const byProjects = url.match(/^https?:\/\/www\.curseforge\.com\/projects\/([^/?#]+)/i);
  if (byProjects) return { kind: 'id', value: byProjects[1] };
  return null;
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} for ${url}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }
  return await res.json();
}

async function downloadToFile(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status} ${url}`);
  await fs.mkdir(join(outPath, '..'), { recursive: true }).catch(() => {});
  const fileStream = createWriteStream(outPath);
  await new Promise((resolve, reject) => {
    res.body.pipe(fileStream);
    res.body.on('error', reject);
    fileStream.on('finish', resolve);
    fileStream.on('error', reject);
  });
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function exists(path) {
  try {
    await fs.stat(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveModrinthFile({ projectId, versionNumber, mc, loader }) {
  const queryUrl =
    `https://api.modrinth.com/v2/project/${encodeURIComponent(projectId)}/version` +
    `?loaders=${encodeURIComponent(JSON.stringify([loader]))}` +
    `&game_versions=${encodeURIComponent(JSON.stringify([mc]))}`;
  const versions = await fetchJson(queryUrl);
  const exact = versions.find((v) => v?.version_number === versionNumber);
  const chosen = exact ?? versions[0];
  if (!chosen) throw new Error(`No Modrinth versions found for ${projectId} (${mc}/${loader})`);
  const files = Array.isArray(chosen.files) ? chosen.files : [];
  const primary = files.find((f) => f?.primary) ?? files[0];
  if (!primary?.url || !primary?.filename) {
    throw new Error(`No downloadable file for Modrinth ${projectId}@${chosen.version_number}`);
  }
  return {
    selectedVersion: chosen.version_number,
    url: primary.url,
    filename: primary.filename,
  };
}

async function resolveCurseforgeModId({ idOrSlug, apiKey }) {
  if (idOrSlug.kind === 'id' && /^\d+$/.test(idOrSlug.value)) {
    return Number(idOrSlug.value);
  }
  if (!apiKey) throw new Error('CF_API_KEY is required to resolve CurseForge slugs');
  if (idOrSlug.kind !== 'slug') throw new Error(`Unsupported CurseForge identifier: ${idOrSlug.kind}`);
  const searchUrl =
    `https://api.curseforge.com/v1/mods/search?gameId=432&classId=6&slug=${encodeURIComponent(
      idOrSlug.value,
    )}`;
  const json = await fetchJson(searchUrl, { headers: { 'x-api-key': apiKey } });
  const data = json?.data;
  const hit = Array.isArray(data) ? data[0] : null;
  const modId = hit?.id;
  if (!modId) throw new Error(`CurseForge mod not found for slug: ${idOrSlug.value}`);
  return Number(modId);
}

async function resolveCurseforgeFile({ modId, versionHint, mc, apiKey }) {
  if (!apiKey) throw new Error('CF_API_KEY is required for CurseForge downloads');
  const filesUrl = `https://api.curseforge.com/v1/mods/${modId}/files?gameVersion=${encodeURIComponent(mc)}`;
  const json = await fetchJson(filesUrl, { headers: { 'x-api-key': apiKey } });
  const files = Array.isArray(json?.data) ? json.data : [];
  if (files.length === 0) throw new Error(`No CurseForge files for modId=${modId} (${mc})`);

  const match = files.find((f) => {
    const hay = `${f?.displayName ?? ''} ${f?.fileName ?? ''}`.toLowerCase();
    return versionHint ? hay.includes(String(versionHint).toLowerCase()) : false;
  });
  const chosen = match ?? files[0];
  const url = chosen?.downloadUrl;
  const filename = chosen?.fileName;
  if (!url || !filename) throw new Error(`CurseForge file missing downloadUrl/fileName for modId=${modId}`);
  return { url, filename };
}

async function main() {
  const { csv, out, mc, loader } = parseArgs(process.argv);
  const apiKey = process.env.CF_API_KEY ?? '';

  const csvText = await fs.readFile(csv, 'utf8');
  const rows = parseCsv(csvText)
    .map((r) => (r.length >= 3 ? [r[0], r[1], r[2]] : r))
    .filter((r) => r.length >= 3);

  const mods = [];
  for (const [nameRaw, urlRaw, versionRaw] of rows) {
    const name = (nameRaw ?? '').trim();
    const url = (urlRaw ?? '').trim();
    const version = (versionRaw ?? '').trim();
    if (!name) continue;
    if (name.startsWith('.index')) continue;
    mods.push({ name, url, version });
  }

  await ensureDir(out);
  const manual = [];

  let ok = 0;
  for (const mod of mods) {
    try {
      if (!mod.url) {
        manual.push({ ...mod, reason: 'no_url' });
        continue;
      }

      const modrinthId = modrinthProjectIdFromUrl(mod.url);
      if (modrinthId) {
        const resolved = await resolveModrinthFile({
          projectId: modrinthId,
          versionNumber: mod.version,
          mc,
          loader,
        });
        const outPath = join(out, resolved.filename);
        if (await exists(outPath)) {
          ok++;
          continue;
        }
        await downloadToFile(resolved.url, outPath);
        ok++;
        continue;
      }

      const cf = curseforgeIdOrSlugFromUrl(mod.url);
      if (cf) {
        const modId = await resolveCurseforgeModId({ idOrSlug: cf, apiKey });
        const resolved = await resolveCurseforgeFile({
          modId,
          versionHint: mod.version,
          mc,
          apiKey,
        });
        const outPath = join(out, resolved.filename);
        if (await exists(outPath)) {
          ok++;
          continue;
        }
        await downloadToFile(resolved.url, outPath);
        ok++;
        continue;
      }

      manual.push({ ...mod, reason: 'unsupported_url' });
    } catch (e) {
      manual.push({ ...mod, reason: `error:${(e && e.message) || String(e)}` });
    }
  }

  const manualPath = join(out, 'modsync.manual.csv');
  const manualCsv =
    ['name,url,version,reason']
      .concat(manual.map((m) => [m.name, m.url, m.version, m.reason].map((x) => `"${String(x ?? '').replaceAll('"', '""')}"`).join(',')))
      .join('\n') + '\n';
  await fs.writeFile(manualPath, manualCsv, 'utf8');

  console.log(`Downloaded/verified: ${ok}/${mods.length}`);
  if (manual.length > 0) {
    console.log(`Manual items: ${manual.length} (see ${manualPath})`);
  }
  console.log(`Source CSV: ${basename(csv)} -> ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

