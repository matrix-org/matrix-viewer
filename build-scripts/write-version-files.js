import { fileURLToPath } from 'node:url';
import path from 'path';
import { mkdir, writeFile } from 'node:fs/promises';
import util from 'util';
const exec = util.promisify(require('child_process').exec);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function mkdirp(path) {
  try {
    await mkdir(path, { recursive: true });
  } catch (err) {
    console.log('mkdirp err', err);
    // no-op, the directory is already created
  }
}

async function writeVersionFiles() {
  let commit;
  let branch;
  try {
    commit = (await exec(`git rev-parse HEAD`)).stdout;
    branch = (await exec(`git rev-parse --abbrev-ref HEAD`)).stdout;
  } catch (err) {
    console.log(
      `Failed to use \`git\` to find the commit and branch.` +
        ` Falling back to using environment variables assuming we're running in GitHub CI. The error encountered:`,
      err
    );

    // Pull these values from environment variables provided by GitHub CI
    commit = process.env.GITHUB_SHA;
    branch = process.env.GITHUB_REF;
  }

  if (!commit || !branch) {
    throw new Error(
      `Unable to get a suitable commit=${commit} or branch=${branch} while writing version files`
    );
  }

  await mkdirp(path.join(__dirname, '../dist/'));
  await writeFile(path.join(__dirname, '../dist/GIT_COMMIT'), commit);
  await writeFile(path.join(__dirname, '../dist/VERSION'), branch);
  await writeFile(path.join(__dirname, '../dist/VERSION_DATE'), new Date().toISOString());
}

export default writeVersionFiles;
