const fs = require('node:fs');
const path = require('node:path');

function installerDownloadURL(release) {
    if (release.draft || release.prerelease || !/^v\d+\.\d+\.\d+$/.test(release.tag_name)) {
        throw new Error('Expected a published stable release with a vX.Y.Z tag.');
    }
    const name = `OpenEnd-${release.tag_name}-windows-amd64-installer.exe`;
    const asset = release.assets.find(asset => asset.name === name && asset.state === 'uploaded');
    if (!asset) throw new Error(`Upload ${name} to the latest release before updating README downloads.`);
    const url = new URL(asset.browser_download_url);
    if (url.protocol !== 'https:' || url.hostname !== 'github.com'
        || !url.pathname.endsWith(`/releases/download/${release.tag_name}/${name}`)
        || url.search || url.hash) {
        throw new Error('Expected a GitHub release asset download URL.');
    }
    return url.href;
}

function updateReadmeDownloads(root, release) {
    const url = installerDownloadURL(release);
    const updates = ['README.md', 'README.zh-CN.md'].map(file => {
        const filename = path.join(root, file);
        const original = fs.readFileSync(filename, 'utf8');
        const link = /(\[[^\]\r\n]+\]\()https:\/\/github\.com\/[^/\s)]+\/[^/\s)]+\/releases\/(?:latest(?:\/download\/[^)\s]+)?|download\/[^)\s]+)(\))/g;
        const matches = [...original.matchAll(link)];
        if (matches.length !== 1) throw new Error(`Expected exactly one release download link in ${file}.`);
        const updated = original.replace(link, (_, before, after) => before + url + after);
        return {filename, original, updated};
    });
    const changed = updates.filter(update => update.original !== update.updated);
    for (const update of changed) fs.writeFileSync(update.filename, update.updated);
    return {url, changedFiles: changed.map(update => path.basename(update.filename))};
}

module.exports = {installerDownloadURL, updateReadmeDownloads};
