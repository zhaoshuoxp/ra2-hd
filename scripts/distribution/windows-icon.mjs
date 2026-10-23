import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { NtExecutable, NtExecutableResource, Resource, Data } from 'resedit';

const [executable, iconFile] = process.argv.slice(2);
assert(executable && iconFile, 'Usage: node windows-icon.mjs executable icon.ico');
const hash = data => createHash('sha256').update(Buffer.from(data)).digest('hex');
const original = fs.readFileSync(executable);
const exe = NtExecutable.from(original, { ignoreCert: true });
assert.equal(exe.is32bit(), false);
const sections = image => image.getAllSections().filter(s => s.info.name !== '.rsrc')
    .map(s => ({ name: s.info.name, virtualAddress: s.info.name === '.reloc' ? null : s.info.virtualAddress,
        hash: hash(s.data ?? new ArrayBuffer(0)) }));
const before = sections(exe);
const resources = NtExecutableResource.from(exe);
const otherResources = entries => entries.filter(e => e.type !== 3 && e.type !== 14)
    .map(e => ({ type: e.type, id: e.id, lang: e.lang, hash: hash(e.bin) }));
const preserved = otherResources(resources.entries);
const icons = Data.IconFile.from(fs.readFileSync(iconFile)).icons.map(i => i.data);
const groups = Resource.IconGroupEntry.fromEntries(resources.entries);
assert(groups.length > 0, 'Expected Electron application icon group');
for (const group of groups) {
    Resource.IconGroupEntry.replaceIconsForResource(resources.entries, group.id, group.lang, icons);
}
resources.outputResource(exe);
const output = Buffer.from(exe.generate());
const parsed = NtExecutable.from(output);
assert.deepEqual(sections(parsed), before, 'Executable code/data sections changed');
// Enlarging .rsrc can move the following relocation table, but not its contents.
const reloc = parsed.getAllSections().find(s => s.info.name === '.reloc');
if (reloc) {
    const directory = parsed.newHeader.optionalHeaderDataDirectory.get(5);
    assert.equal(directory.virtualAddress, reloc.info.virtualAddress);
    assert(directory.size <= reloc.info.virtualSize);
}
const verified = NtExecutableResource.from(parsed);
assert.deepEqual(otherResources(verified.entries), preserved, 'Non-icon resources changed');
const bytes = icon => hash(icon.isRaw() ? icon.bin : icon.generate());
for (const group of Resource.IconGroupEntry.fromEntries(verified.entries)) {
    assert.deepEqual(group.getIconItemsFromEntries(verified.entries).map(bytes), icons.map(bytes));
}
fs.writeFileSync(`${executable}.tmp`, output);
fs.renameSync(`${executable}.tmp`, executable);
console.log(JSON.stringify({ executable, iconGroups: groups.length, sizes: icons.length,
    before: hash(original), after: hash(output), codeAndNonIconResources: 'UNCHANGED',
    signing: 'CUSTOMIZED_EXECUTABLE_UNSIGNED', windowsExecution: 'NOT_RUN_ON_THIS_MAC' }));
