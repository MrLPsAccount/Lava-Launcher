"""Lava v0.10 local Minecraft discovery and screenshot helpers.
Only reads regular .minecraft data, never reads the official launcher's credentials.
"""
import io
import json
import os
import re
import struct
import base64
from pathlib import Path
from datetime import datetime
from PIL import Image, ImageOps


def minecraft_dir():
    return (Path(os.environ['APPDATA']) / '.minecraft') if os.name == 'nt' and os.environ.get('APPDATA') else Path.home() / '.minecraft'


class NBTReader:
    """Small, bounded NBT parser for servers.dat (uncompressed NBT)."""
    def __init__(self, data):
        if len(data) > 5_000_000:
            raise ValueError('Server list is unexpectedly large')
        self.buf = io.BytesIO(data)
        self.items = 0

    def read(self, size):
        value = self.buf.read(size)
        if len(value) != size:
            raise ValueError('Incomplete NBT')
        return value

    def number(self, fmt):
        return struct.unpack('>' + fmt, self.read(struct.calcsize('>' + fmt)))[0]

    def string(self):
        n = self.number('H')
        if n > 32767:
            raise ValueError('NBT string too long')
        return self.read(n).decode('utf-8', errors='replace')

    def payload(self, tag, depth=0):
        self.items += 1
        if depth > 20 or self.items > 20000:
            raise ValueError('NBT nesting limit exceeded')
        if tag in (1,2,3,4,5,6):
            return self.number({1:'b',2:'h',3:'i',4:'q',5:'f',6:'d'}[tag])
        if tag in (7,11,12):
            n = self.number('i')
            unit = {7:1,11:4,12:8}[tag]
            if n < 0 or n*unit > 5_000_000:
                raise ValueError('NBT array too long')
            data = self.read(n*unit)
            return data if tag == 7 else None
        if tag == 8:
            return self.string()
        if tag == 9:
            element = self.number('B'); n = self.number('i')
            if n < 0 or n > 5000:
                raise ValueError('NBT list too long')
            return [self.payload(element, depth+1) for _ in range(n)]
        if tag == 10:
            out = {}
            while True:
                kind = self.number('B')
                if kind == 0: break
                name = self.string()
                out[name] = self.payload(kind,depth+1)
            return out
        raise ValueError('Unknown NBT type')

    def root(self):
        if self.number('B') != 10:
            raise ValueError('Expected compound root')
        self.string()
        return self.payload(10)


def imported_server_list(game):
    path = game / 'servers.dat'
    if not path.is_file():
        return []
    try:
        data = NBTReader(path.read_bytes()).root()
        return [{'name': str(item.get('name') or item.get('ip'))[:100],
                 'address': str(item.get('ip',''))[:255], 'source': 'minecraft'}
                for item in (data.get('servers') or []) if isinstance(item,dict)
                and re.fullmatch(r'[A-Za-z0-9.\-_:]{1,253}',str(item.get('ip','')))]
    except (ValueError, OSError, MemoryError):
        return []


def discover(game=None):
    game = Path(game) if game else minecraft_dir()
    if not game.is_dir():
        return {'ok':False,'error':'The .minecraft folder was not found. Install Minecraft Java Edition first.'}
    versions = []
    ver_root = game/'versions'
    if ver_root.is_dir():
        for folder in sorted(ver_root.iterdir(), key=lambda p:p.name.lower()):
            if folder.is_dir() and (folder / (folder.name+'.json')).is_file():
                versions.append(folder.name)
    profiles = []
    for f in ('launcher_profiles.json','launcher_profiles_microsoft_store.json'):
        path = game / f
        if not path.is_file(): continue
        try:
            doc = json.loads(path.read_text(encoding='utf-8'))
            for key,p in (doc.get('profiles') or {}).items():
                if not isinstance(p,dict): continue
                version = str(p.get('lastVersionId') or '')[:90]
                if not version: continue
                loader = 'neoforge' if 'neoforge' in version.lower() else 'fabric' if 'fabric' in version.lower() else 'vanilla'
                label = str(p.get('name') or version).strip()[:100]
                profiles.append({'name':label, 'version':version, 'loader':loader,
                                 'source':'minecraft', 'profileId':str(key)[:100]})
        except (ValueError,OSError,TypeError):
            continue
    worlds = []
    saves = game/'saves'
    if saves.is_dir():
        for folder in sorted(saves.iterdir(),key=lambda f:f.name.lower()):
            if folder.is_dir() and (folder/'level.dat').is_file():
                worlds.append({'name':folder.name[:100],'folder':folder.name[:100],
                               'source':'minecraft','version':''})
    servers = imported_server_list(game)
    return {'ok':True,'path':str(game),'worlds':worlds[:500], 'servers':servers[:500],
            'modpacks':profiles[:500], 'versions':versions[:300],
            'screenshots_count':len(list((game/'screenshots').glob('*.png'))) if (game/'screenshots').is_dir() else 0}


def screenshot_path(name, game=None):
    base = (Path(game) if game else minecraft_dir()) / 'screenshots'
    name = str(name or '')
    if not name or Path(name).name != name or '/' in name or '\\' in name or not name.lower().endswith('.png'):
        raise ValueError('Invalid screenshot filename')
    path = base / name
    if not path.is_file():
        raise FileNotFoundError('Screenshot not found')
    if path.stat().st_size > 40_000_000:
        raise ValueError('Screenshot is too large')
    return path


def as_preview(img, max_size=(800,480), quality=76):
    with Image.open(img) as source:
        source.load()
        if source.width*source.height > 24_000_000:
            raise ValueError('Screenshot dimensions are too large')
        image = ImageOps.exif_transpose(source).convert('RGB')
    image.thumbnail(max_size, Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    image.save(buf,format='JPEG',quality=quality,optimize=True)
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode('ascii')


def screenshots(game=None, limit=120):
    root = (Path(game) if game else minecraft_dir())/'screenshots'
    if not root.is_dir(): return []
    all_files = sorted(root.glob('*.png'),key=lambda p:p.stat().st_mtime,reverse=True)
    result = []
    for path in all_files[:limit]:
        try:
            result.append({'name':path.name,'modified':datetime.fromtimestamp(path.stat().st_mtime).isoformat(timespec='seconds'),
                           'size':path.stat().st_size,'thumbnail':as_preview(path,(430,250),70)})
        except (OSError,ValueError,MemoryError): continue
    return result
