/**
 * One-off: copies the media already on disk into ImageKit under the same filenames, so the
 * `/uploads/<filename>` values stored in the database keep resolving after the switch.
 *
 *   node --env-file=.env scripts/migrate-media-to-imagekit.mjs [--dry-run]
 *
 * Reads UPLOADS_DIR (default ./uploads) and the IMAGEKIT_* settings. Safe to re-run: a file
 * already present with the same name is skipped, and nothing on disk is deleted — remove the
 * local copies yourself once the app is serving from ImageKit.
 */
import { readdir, readFile, stat } from 'fs/promises';
import { isAbsolute, join } from 'path';
import ImageKit from 'imagekit';

const dryRun = process.argv.includes('--dry-run');
const folder = (process.env.IMAGEKIT_FOLDER?.trim() || 'wear-it').replace(/^\/+|\/+$/g, '');
const directory = (() => {
  const configured = process.env.UPLOADS_DIR?.trim();
  if (!configured) return join(process.cwd(), 'uploads');
  return isAbsolute(configured) ? configured : join(process.cwd(), configured);
})();

const required = ['IMAGEKIT_PUBLIC_KEY', 'IMAGEKIT_PRIVATE_KEY', 'IMAGEKIT_URL_ENDPOINT'];
const missing = required.filter((key) => !process.env[key]?.trim());
if (missing.length) {
  console.error(`Missing ${missing.join(', ')}. Set them in .env or the environment.`);
  process.exit(1);
}

const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY.trim(),
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY.trim(),
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT.trim().replace(/\/+$/, ''),
});

/**
 * Names already in the folder, so a re-run does not re-upload what is there. On the first
 * run the folder does not exist yet and listing it can fail; an empty set is the safe answer,
 * since uploads overwrite by name and the only cost is redundant work.
 */
async function existingNames() {
  const names = new Set();
  try {
    for (let skip = 0; ; skip += 1000) {
      const page = await imagekit.listFiles({ path: folder, limit: 1000, skip });
      for (const file of page) if (file.name) names.add(file.name);
      if (page.length < 1000) break;
    }
  } catch (error) {
    console.log(`Could not list /${folder} (${error.message}); treating it as empty.`);
    return new Set();
  }
  return names;
}

const files = (await readdir(directory)).filter((name) => !name.startsWith('.'));
if (!files.length) {
  console.log(`Nothing to migrate: ${directory} is empty.`);
  process.exit(0);
}

const present = await existingNames();
console.log(`${files.length} file(s) in ${directory}; ${present.size} already in /${folder}.`);

let uploaded = 0;
let skipped = 0;
let failed = 0;

for (const name of files) {
  const path = join(directory, name);
  if ((await stat(path)).isDirectory()) continue;
  if (present.has(name)) {
    skipped += 1;
    continue;
  }
  if (dryRun) {
    console.log(`would upload ${name}`);
    uploaded += 1;
    continue;
  }
  try {
    await imagekit.upload({
      file: await readFile(path),
      fileName: name,
      folder,
      // The filename is the identifier the database holds; it must survive the upload.
      useUniqueFileName: false,
      overwriteFile: true,
    });
    uploaded += 1;
    if (uploaded % 25 === 0) console.log(`  ${uploaded} uploaded…`);
  } catch (error) {
    failed += 1;
    console.error(`  FAILED ${name}: ${error.message}`);
  }
}

console.log(`${dryRun ? 'Would upload' : 'Uploaded'} ${uploaded}, skipped ${skipped}, failed ${failed}.`);
process.exit(failed ? 1 : 0);
