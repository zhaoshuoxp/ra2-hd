// Publish only the verified missing immutable files, before a separately checked fast-forward.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const output = path.resolve(process.argv[2]);
const plan = JSON.parse(await fs.readFile(path.join(output, 'resource-transfer-plan.json')));
const checkpoint = JSON.parse(await fs.readFile(path.join(output, 'pre-integration/snapshot.json')));
const main = path.resolve(process.argv[3]);
const git = (...args) => execFileSync('git', ['--no-optional-locks', ...args], { cwd: main, encoding: 'utf8' }).trim();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(git('branch', '--show-current'), 'main');
assert.equal(git('rev-parse', 'HEAD'), checkpoint.mainHead);
assert.equal(git('status', '--porcelain'), '');
assert.equal(sha(await fs.readFile(path.join(main, '.local/ui-selection.json'))),
    checkpoint.selections['.local/ui-selection.json'].sha256);
const rows = [];
try {
    for (const row of plan.files) {
        assert(!path.isAbsolute(row.file) && !row.file.split('/').includes('..'));
        assert.equal(row.destination, path.join(main, '.local', row.file));
        assert.equal(await fs.realpath(row.source), row.source);
        const bytes = await fs.readFile(row.source);
        assert.equal(bytes.length, row.bytes); assert.equal(sha(bytes), row.sha256);
        await fs.mkdir(path.dirname(row.destination), { recursive: true });
        assert.equal(await fs.realpath(path.dirname(row.destination)), path.dirname(row.destination));
        let action = 'ADDED_EXCLUSIVELY';
        try { await fs.copyFile(row.source, row.destination, fs.constants.COPYFILE_EXCL | fs.constants.COPYFILE_FICLONE); }
        catch (error) {
            if (error.code !== 'EEXIST') throw error;
            action = 'REUSED_IDENTICAL';
        }
        assert.equal(await fs.realpath(row.destination), row.destination);
        assert.equal(sha(await fs.readFile(row.destination)), row.sha256);
        assert.notEqual((await fs.stat(row.destination)).ino, (await fs.stat(row.source)).ino);
        rows.push({ file: row.file, sha256: row.sha256, bytes: row.bytes, action });
    }
    assert.equal(git('rev-parse', 'HEAD'), checkpoint.mainHead);
    assert.equal(git('status', '--porcelain'), '');
    await fs.writeFile(path.join(output, 'resource-publication.json'), JSON.stringify({
        status: 'PASS_EXCLUSIVE_IMMUTABLE_PUBLICATION', mainPreHead: checkpoint.mainHead,
        sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        preparedContract: plan.preparedContract, files: rows,
    }, null, 2) + '\n');
    console.log(`Verified ${rows.length} immutable main files; no existing file replaced.`);
} catch (error) {
    await fs.writeFile(path.join(output, 'resource-publication-failure.json'), JSON.stringify({
        status: 'FAILED_WITHOUT_REPLACEMENTS', error: error.stack, completed: rows,
    }, null, 2) + '\n');
    throw error;
}
