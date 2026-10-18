const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {installerDownloadURL, updateReadmeDownloads} = require('./update-readme-download.cjs');

const url = 'https://github.com/SymphonyW/OpenEnd/releases/download/v2.1.3/OpenEnd-v2.1.3-windows-amd64-installer.exe';
const release = {tag_name: 'v2.1.3', draft: false, prerelease: false, assets: [
    {name: 'openend-amd64-installer.exe', state: 'uploaded', browser_download_url: 'https://example.com/alias'},
    {name: 'OpenEnd-v2.1.3-windows-amd64-installer.exe', state: 'uploaded', browser_download_url: url},
]};

test('selects the uploaded versioned installer and refuses missing or invalid assets', () => {
    assert.equal(installerDownloadURL(release), url);
    for (const changed of [{draft: true}, {prerelease: true}, {tag_name: 'v2.1.4'}, {assets: []},
        {assets: [{...release.assets[1], state: 'new'}]},
        {assets: [{...release.assets[1], browser_download_url: 'https://example.com/installer.exe'}]}]) {
        assert.throws(() => installerDownloadURL({...release, ...changed}));
    }
});

test('updates both languages while preserving labels, line endings and other edits', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openend-readme-'));
    try {
        const english = '# OpenEnd\r\n\r\n[Download Windows installer](https://github.com/SymphonyW/OpenEnd/releases/latest)\r\nUser content\r\n';
        const chinese = '# OpenEnd\n\n[下载Windows版本的安装包](https://github.com/SymphonyW/OpenEnd/releases/latest/download/openend-amd64-installer.exe)\n';
        fs.writeFileSync(path.join(root, 'README.md'), english);
        fs.writeFileSync(path.join(root, 'README.zh-CN.md'), chinese);
        assert.deepEqual(updateReadmeDownloads(root, release).changedFiles, ['README.md', 'README.zh-CN.md']);
        assert.equal(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), english.replace('https://github.com/SymphonyW/OpenEnd/releases/latest', url));
        assert.equal(fs.readFileSync(path.join(root, 'README.zh-CN.md'), 'utf8'), chinese.replace('https://github.com/SymphonyW/OpenEnd/releases/latest/download/openend-amd64-installer.exe', url));
        assert.deepEqual(updateReadmeDownloads(root, release).changedFiles, []);
        const nextURL = url.replaceAll('2.1.3', '2.1.4');
        const nextRelease = {...release, tag_name: 'v2.1.4', assets: [{...release.assets[1], name: 'OpenEnd-v2.1.4-windows-amd64-installer.exe', browser_download_url: nextURL}]};
        assert.equal(updateReadmeDownloads(root, nextRelease).url, nextURL);
        const previous = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
        fs.writeFileSync(path.join(root, 'README.zh-CN.md'), '# Missing download link');
        assert.throws(() => updateReadmeDownloads(root, release));
        assert.equal(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), previous);
    } finally {
        assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
        assert.match(path.basename(root), /^openend-readme-/);
        fs.rmSync(root, {recursive: true});
    }
});
