"""Create reviewed, separate playable/source archives. No upload or installation."""
from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parents[1]
version = (root / 'VERSION').read_text(encoding='utf-8').strip()
assert json.loads((root / 'package.json').read_text(encoding='utf-8'))['version'] == version
assert 'v' + version in (root / 'dist/index.html').read_text(encoding='utf-8')
for image in (root / 'assets').glob('*.png'):
    assert image.read_bytes().startswith(b'\x89PNG\r\n\x1a\n'), f'Invalid PNG: {image.name}'
gif = (root / 'assets/gameplay.gif').read_bytes()
assert len(gif) > 1000 and gif[:6] in (b'GIF87a', b'GIF89a'), 'Gameplay GIF is missing or invalid'
out = root / 'release'
out.mkdir(exist_ok=True)

def make_archive(name, entries):
    manifest = {target: hashlib.sha256(source.read_bytes()).hexdigest() for target, source in entries.items()}
    path = out / name
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for target, source in sorted(entries.items()):
            archive.write(source, 'Rumblecrumb/' + target)
        archive.writestr('Rumblecrumb/FILE-SHA256.json', json.dumps(manifest, indent=2))
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
        for target, checksum in manifest.items():
            assert hashlib.sha256(archive.read('Rumblecrumb/' + target)).hexdigest() == checksum
    return {'file': name, 'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'files': len(entries), 'extractionVerified': True}

playable = {name: root / name for name in ['serve.py', 'Start-Rumblecrumb.cmd', 'VERSION', 'LICENSE', 'THIRD-PARTY-NOTICES.md', 'CREDITS.md']}
playable['README.md'] = root / 'docs/PLAY.md'
playable['TESTING.md'] = root / 'docs/TESTING.md'
for folder in ['dist', 'licenses']:
    for source in sorted((root / folder).rglob('*')):
        if source.is_file():
            playable[source.relative_to(root).as_posix()] = source

source_entries = {name: root / name for name in ['README.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'CREDITS.md', 'LICENSE', 'THIRD-PARTY-NOTICES.md', 'VERSION', 'index.html', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'serve.py', 'Start-Rumblecrumb.cmd', '.gitignore', '.gitattributes', '.prettierignore']}
for folder in ['src', 'tests', 'licenses', 'assets', 'docs', 'scripts', '.github']:
    for source in sorted((root / folder).rglob('*')):
        if source.is_file() and '__pycache__' not in source.parts and source.suffix != '.pyc':
            source_entries[source.relative_to(root).as_posix()] = source
assert all('.env' not in Path(name).parts for name in source_entries)
receipts = [make_archive(f'Rumblecrumb-v{version}-playable.zip', playable), make_archive(f'Rumblecrumb-v{version}-source.zip', source_entries)]
(out / 'SHA256SUMS.txt').write_text(''.join(f"{item['sha256']}  {item['file']}\n" for item in receipts), encoding='utf-8')
(out / 'PACKAGE-RECEIPT.json').write_text(json.dumps({'version': version, 'published': False, 'artifacts': receipts}, indent=2), encoding='utf-8')
print(json.dumps(receipts))
