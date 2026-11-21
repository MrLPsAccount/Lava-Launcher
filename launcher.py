"""Lava Desktop — launcher backend. Windows 10/11; Microsoft OAuth via system browser.

No Minecraft account passwords are collected. A registered and approved public OAuth
application ID is required for Minecraft Services; Lava does not ship another app's ID.
"""
from __future__ import annotations

import base64
import datetime
import ipaddress
import io
from functools import lru_cache
from PIL import ImageEnhance
import json
import shutil
import ctypes
import tempfile
from native_v10 import minecraft_dir, discover, screenshot_path, screenshots, as_preview
import os
import platform
import re
import subprocess
import sys
import threading
import urllib.request
import uuid
import webbrowser
from pathlib import Path
from urllib.parse import urlparse, quote

import keyring
import minecraft_launcher_lib as mcl
import psutil
import webview
from PIL import Image, ImageDraw

APP_VERSION = "0.10.1"
APP_NAME = "Lava Launcher"
REDIRECT_URI = "https://login.live.com/oauth20_desktop.srf"
BASE = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
DATA_DIR = Path(os.environ.get("APPDATA") or Path.home() / ".config") / "LavaLauncher"
SETTINGS_FILE = DATA_DIR / "settings.json"
DEVELOPER_CONFIG = Path(__file__).resolve().parent / "lava_config.json"
TOKEN_SERVICE = "LavaLauncher-Microsoft"
WINDOW = None
RESET_AFTER_EXIT = False
RESET_MARKER = DATA_DIR.parent / '.lava-reset-pending'


def load_json(path):
    try:
        v = json.loads(path.read_text(encoding="utf-8"))
        return v if isinstance(v, dict) else {}
    except (ValueError, OSError):
        return {}


def save_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(obj, indent=2), encoding="utf-8")
    temp.replace(path)


def developer_config():
    return load_json(DEVELOPER_CONFIG) if DEVELOPER_CONFIG.exists() else load_json(DATA_DIR / "lava_config.json")


def client_id():
    return (os.environ.get("LAVA_MICROSOFT_CLIENT_ID") or developer_config().get("microsoft_client_id") or "").strip()


def update_feed_url():
    return (os.environ.get("LAVA_UPDATE_MANIFEST_URL") or developer_config().get("update_manifest_url") or "").strip()


@lru_cache(maxsize=1)
def rgb_steve():
    """Grayscale Steve head: try the public MHF_Steve avatar, fall back to embedded pixel art.

    Only the generic default avatar is requested; user skin images come separately
    after Microsoft login. Cache this locally so it also works without a network.
    """
    cache = DATA_DIR / "assets" / "steve_head.png"
    source = None
    try:
        if cache.is_file():
            source = Image.open(cache).convert("RGBA")
        else:
            url = "https://mc-heads.net/avatar/MHF_Steve/128.png"
            req = urllib.request.Request(url, headers={"User-Agent": "LavaLauncher/0.9.1"})
            with urllib.request.urlopen(req, timeout=3) as resp:
                raw = resp.read(500_000)
            if raw:
                source = Image.open(io.BytesIO(raw)).convert("RGBA")
                if not (8 <= source.width <= 512 and 8 <= source.height <= 512):
                    source = None
                else:
                    cache.parent.mkdir(parents=True, exist_ok=True)
                    source.save(cache, format="PNG")
    except Exception:
        source = None
    if source is not None:
        source = source.resize((96, 96), Image.Resampling.NEAREST)
        return as_png_data(ImageEnhance.Color(source).enhance(0.40))

    im = Image.new("RGBA", (8, 8), (0, 0, 0, 0))
    hair = (49, 30, 25); skin = (187, 140, 98); shade = (150, 104, 70)
    for y in range(8):
        for x in range(8):
            im.putpixel((x, y), hair + (255,) if y < 2 or (y == 2 and x in (0, 7)) else skin + (255,))
    for x in (1, 2, 5, 6):
        im.putpixel((x, 4), (245, 247, 250, 255))
    for x in (2, 5):
        im.putpixel((x, 4), (64, 108, 176, 255))
    for x in (3, 4):
        im.putpixel((x, 6), shade + (255,))
    return as_png_data(ImageEnhance.Color(im.resize((96, 96), Image.Resampling.NEAREST)).enhance(0.40))


def as_png_data(im):
    f = io.BytesIO()
    im.save(f, format="PNG")
    return "data:image/png;base64," + base64.b64encode(f.getvalue()).decode("ascii")


def skin_head(profile):
    """Crop the real Minecraft skin head from the authenticated profile's skin URL."""
    for skin in profile.get("skins", []) or []:
        url = str(skin.get("url", ""))
        parsed = urlparse(url)
        if parsed.scheme not in {"https", "http"} or parsed.hostname not in {"textures.minecraft.net", "minecraft.net"}:
            continue
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "LavaLauncher/0.9"})
            with urllib.request.urlopen(req, timeout=7) as r:
                raw = r.read(900_000)
            image = Image.open(io.BytesIO(raw)).convert("RGBA")
            if image.width < 64 or image.height < 32:
                continue
            face = image.crop((8, 8, 16, 16))
            if image.height >= 64:
                overlay = image.crop((40, 8, 48, 16))
                face.alpha_composite(overlay)
            return as_png_data(face.resize((96, 96), Image.Resampling.NEAREST))
        except Exception:
            continue
    return rgb_steve()


def get_powershell_value(expression):
    if os.name != "nt":
        return ""
    try:
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        p = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", expression],
                           capture_output=True, text=True, timeout=6, creationflags=creationflags)
        return p.stdout.strip().splitlines()[0].strip() if p.returncode == 0 and p.stdout.strip() else ""
    except (OSError, subprocess.TimeoutExpired):
        return ""


def system_info():
    mem = psutil.virtual_memory()
    ram_gb = max(1, round(mem.total / (1024 ** 3), 1))
    # Always leave at least ~2 GB, preferably 25% of the system, available to Windows.
    max_ram = max(1024, min(32768, ((int(mem.total / (1024**2) * .75)) // 512) * 512))
    cpu = get_powershell_value("(Get-CimInstance Win32_Processor | Select-Object -First 1 -ExpandProperty Name)")
    gpu = get_powershell_value("(Get-CimInstance Win32_VideoController | Select-Object -First 1 -ExpandProperty Name)")
    cpu = cpu or platform.processor() or "Unknown processor"
    return {"os": platform.platform(), "cpu": cpu, "cores": psutil.cpu_count(logical=False) or "Unknown",
            "threads": psutil.cpu_count(logical=True) or "Unknown", "gpu": gpu or "Not detected",
            "ram_gb": ram_gb, "max_alloc_mb": max_ram, "minecraft_minimum": {
                "ram": "8 GB with dedicated GPU / 12 GB with integrated GPU",
                "cpu": "4-core 64-bit processor", "gpu": "Vulkan 1.3 capable, at least 2 GB VRAM",
                "os": "64-bit Windows 10 or later", "recommended_ram": "16 GB system RAM"}}


class LavaAPI:
    def __init__(self):
        self.settings = load_json(SETTINGS_FILE)
        self.settings.setdefault("ram_mb", 4096)
        self.settings.setdefault("theme", "ocean")
        self.settings.setdefault("gradient_start", "#22384b")
        self.settings.setdefault("gradient_end", "#101e2b")
        self.sys = system_info()
        self.settings["ram_mb"] = self._clamp_ram(self.settings["ram_mb"])
        self.account = None
        self.account_head = rgb_steve()
        self.pending = None
        self.lock = threading.Lock()
        self.game_dir = DATA_DIR / "game"  # Made at first actual launch.
        self._status_cache = {}
        self._status_lock = threading.Lock()
        save_json(SETTINGS_FILE, self.settings)

    def _clamp_ram(self, ram):
        try:
            value = int(ram)
        except (ValueError, TypeError):
            value = 4096
        return max(1024, min((value // 512) * 512, self.sys["max_alloc_mb"]))

    def _public_account(self):
        if not self.account:
            return None
        return {"name": self.account.get("name", "Player"), "uuid": self.account.get("id", ""),
                "head": self.account_head}

    def info(self):
        return {"desktop": True, "version": APP_VERSION, "account": self._public_account(),
                "steve_head": rgb_steve(), "oauth_available": bool(client_id()),
                "system": self.sys, "settings": self.settings,
                "game_directory_exists": self.game_dir.is_dir()}

    def begin_login(self):
        cid = client_id()
        if not cid:
            return {"ok": False, "error": "Microsoft sign-in isn't configured yet. The Lava developer must supply an approved Microsoft application ID in lava_config.json."}
        try:
            uuid.UUID(cid)
            url, state, verifier = mcl.microsoft_account.get_secure_login_data(cid, REDIRECT_URI)
            self.pending = {"client_id": cid, "state": state, "verifier": verifier}
            webbrowser.open(url)
            return {"ok": True, "message": "Microsoft sign-in opened. After completing sign-in, copy the address from the final redirect page into Lava to finish securely."}
        except Exception as ex:
            return {"ok": False, "error": f"Unable to begin Microsoft sign-in: {ex}"}

    def complete_login(self, redirect_url):
        p = self.pending
        self.pending = None
        if not p:
            return {"ok": False, "error": "Start Microsoft sign-in first."}
        try:
            code = mcl.microsoft_account.parse_auth_code_url(str(redirect_url).strip(), p["state"])
            auth = mcl.microsoft_account.complete_login(p["client_id"], None, REDIRECT_URI, code, p["verifier"])
            keyring.set_password(TOKEN_SERVICE, p["client_id"], auth["refresh_token"])
            self.account = auth
            self.account_head = skin_head(auth)
            return {"ok": True, "account": self._public_account()}
        except Exception as ex:
            return {"ok": False, "error": f"Microsoft authentication failed: {ex}"}

    def restore_login(self):
        cid = client_id()
        if not cid:
            return {"ok": False, "error": "Lava's Microsoft application is not configured."}
        try:
            token = keyring.get_password(TOKEN_SERVICE, cid)
            if not token:
                return {"ok": False, "error": "No saved Minecraft session."}
            auth = mcl.microsoft_account.complete_refresh(cid, None, None, token)
            keyring.set_password(TOKEN_SERVICE, cid, auth["refresh_token"])
            self.account = auth
            self.account_head = skin_head(auth)
            return {"ok": True, "account": self._public_account()}
        except Exception as ex:
            return {"ok": False, "error": f"Couldn't restore your Minecraft session: {ex}"}

    def sign_out(self):
        cid = client_id()
        if cid:
            try:
                keyring.delete_password(TOKEN_SERVICE, cid)
            except Exception:
                pass
        self.account = None
        self.account_head = rgb_steve()
        self.pending = None
        return {"ok": True}

    def save_memory(self, amount_mb):
        amount = self._clamp_ram(amount_mb)
        self.settings["ram_mb"] = amount
        save_json(SETTINGS_FILE, self.settings)
        return {"ok": True, "ram_mb": amount}

    def save_appearance(self, theme, gradient_start, gradient_end):
        if theme not in {"ocean", "ember", "violet", "forest", "custom"}:
            return {"ok": False, "error": "Invalid theme."}
        if any(not re.fullmatch(r"#[0-9a-fA-F]{6}", s or "") for s in (gradient_start, gradient_end)):
            return {"ok": False, "error": "Select two valid colors."}
        self.settings.update(theme=theme, gradient_start=gradient_start, gradient_end=gradient_end)
        save_json(SETTINGS_FILE, self.settings)
        return {"ok": True, "settings": self.settings}

    def restore_default_appearance(self):
        self.settings.update(theme="ocean", gradient_start="#22384b", gradient_end="#101e2b")
        save_json(SETTINGS_FILE, self.settings)
        return {"ok": True, "settings": self.settings}

    def save_microsoft_client_id(self, submitted):
        """Configures only the public App (Client) ID, never a password or client secret.

        Important: registration is not equivalent to approval by Minecraft Services.
        """
        value = str(submitted or "").strip()
        try:
            parsed = uuid.UUID(value)
        except (ValueError, AttributeError, TypeError):
            return {"ok": False, "error": "Enter a valid Microsoft application (client) ID (GUID)."}
        path = DATA_DIR / "lava_config.json"
        config = load_json(path)
        config["microsoft_client_id"] = str(parsed)
        save_json(path, config)
        return {"ok": True, "oauth_available": bool(client_id()),
                "message": "Application ID saved. Minecraft Services approval is still required before sign-in can succeed."}

    def open_registration_guide(self):
        webbrowser.open("https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app")
        return {"ok": True}

    def local_minecraft(self):
        """Read ONLY ordinary local metadata; no credential or token extraction."""
        game = Path(os.environ.get("APPDATA", "")) / ".minecraft" if os.name == "nt" else Path.home() / ".minecraft"
        versions = []
        folder = game / "versions"
        if folder.is_dir():
            for entry in sorted(folder.iterdir(), key=lambda x: x.name.casefold()):
                if entry.is_dir() and (entry / (entry.name + ".json")).is_file() and (entry / (entry.name + ".jar")).is_file():
                    versions.append(entry.name)
        return {"ok": True, "installed": game.is_dir(), "path": str(game),
                "versions": versions[:120], "total_versions": len(versions),
                "note": "This detects existing files, but does not authenticate or grant access to the game."}

    def open_saves_folder(self):
        """Show the real vanilla .minecraft/saves folder; worlds are made in-game."""
        game = Path(self.local_minecraft()["path"])
        if not game.is_dir():
            return {"ok": False, "error": "No .minecraft folder detected yet. Install and open Minecraft first."}
        folder = game / "saves"
        try:
            folder.mkdir(parents=True, exist_ok=True)
            if os.name == "nt":
                os.startfile(str(folder))
            elif sys.platform == "darwin":
                subprocess.Popen(["open", str(folder)])
            else:
                subprocess.Popen(["xdg-open", str(folder)])
            return {"ok": True, "path": str(folder)}
        except (OSError, PermissionError) as ex:
            return {"ok": False, "error": f"Unable to open saves folder: {ex}"}

    def server_status(self, address):
        """Status via native HTTP: browser fetches can be denied by the public API's User-Agent policy.

        Backends cache independently. Never label a failed lookup as an offline game server.
        """
        import time
        value = str(address or "").strip()
        if not re.fullmatch(r"[A-Za-z0-9._:-]{1,253}", value) or '/' in value:
            return {"error": True, "online": None, "reason": "Invalid server address"}
        host = value.rsplit(":", 1)[0] if re.fullmatch(r".+:[0-9]{1,5}", value) else value
        if host.lower() == 'localhost' or host.lower().endswith('.local'):
            return {"error": True, "online": None, "reason": "Local servers cannot be checked by the public status providers"}
        try:
            ip = ipaddress.ip_address(host)
            if not ip.is_global:
                return {"error": True, "online": None, "reason": "Private-network servers cannot be checked by public status providers"}
        except ValueError:
            pass
        key = value.lower()
        with self._status_lock:
            cached = self._status_cache.get(key)
            if cached and time.monotonic() - cached[0] < 75:
                return dict(cached[1])
        def fetch_json(url):
            req = urllib.request.Request(url, headers={
                "User-Agent": f"LavaLauncher/{APP_VERSION} (Minecraft desktop server library)",
                "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=5) as reply:
                raw = reply.read(280_000)
                if len(raw) >= 280_000:
                    raise ValueError("Status response too large")
                return json.loads(raw.decode("utf-8"))
        first = None
        try:
            data = fetch_json("https://api.mcsrvstat.us/3/" + quote(value, safe=':'))
            if isinstance(data, dict) and isinstance(data.get("online"), bool):
                first = {"online": data["online"], "players": data.get("players", {}),
                         "version": data.get("version", ""), "motd": data.get("motd", {}),
                         "icon": data.get("icon", ""), "source": "mcsrvstat.us"}
                if first["online"]:
                    with self._status_lock:
                        self._status_cache[key] = (time.monotonic(), first)
                    return first
        except Exception:
            pass
        # An offline or failed response from one public service isn't proof the server is down.
        try:
            data = fetch_json("https://api.mcstatus.io/v2/status/java/" + quote(value, safe=':'))
            if isinstance(data, dict) and isinstance(data.get("online"), bool):
                version = data.get("version") or {}
                if isinstance(version, dict):
                    version = (version.get("name") or {}).get("clean", "") if isinstance(version.get("name"), dict) else version.get("name", "")
                motd = data.get("motd") or {}
                if isinstance(motd, dict) and isinstance(motd.get('clean'), str):
                    motd = {"clean": motd['clean']}
                result = {"online": data["online"], "players": data.get("players") or {},
                          "version": version, "motd": motd, "icon": data.get("icon") or "", "source": "mcstatus.io"}
                with self._status_lock:
                    self._status_cache[key] = (time.monotonic(), result)
                return result
        except Exception:
            pass
        result = first if first is not None else {"error": True, "online": None, "reason": "Status providers could not be reached"}
        with self._status_lock:
            self._status_cache[key] = (time.monotonic(), result)
        return result

    @staticmethod
    def _clean_library(raw):
        """Allow only shareable Library metadata. Never accept credentials or executable content."""
        if not isinstance(raw, dict):
            raise ValueError("Backup library data must be an object")
        result = {"libraryDefaultsV072": True, "settings": {}}
        source_settings = raw.get("settings") or {}
        if isinstance(source_settings, dict):
            for key in ("name", "version", "ram"):
                if isinstance(source_settings.get(key), str):
                    result["settings"][key] = source_settings[key][:90]
        fields = ("name", "version", "address", "loader", "builtIn", "banner", "favorite", "lastViewed", "source", "folder", "profileId", "bannerId")
        for category in ("servers", "worlds", "modpacks", "installations"):
            entries = raw.get(category, [])
            if not isinstance(entries, list) or len(entries) > 2000:
                raise ValueError(f"Invalid {category} in Lava backup")
            cleaned = []
            for item in entries:
                if not isinstance(item, dict):
                    continue
                entry = {}
                for key in fields:
                    v = item.get(key)
                    if key == "favorite" and isinstance(v, bool):
                        entry[key] = v
                    elif key == "lastViewed" and isinstance(v, (int, float)) and 0 <= v <= 9999999999999:
                        entry[key] = v
                    elif key == "banner" and category in ("servers", "worlds") and isinstance(v, str) and len(v) <= 3_000_000 and re.fullmatch(r"data:image/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+", v):
                        entry[key] = v
                    elif key in ("name", "version", "address", "loader", "builtIn", "source", "folder", "profileId", "bannerId") and isinstance(v, str):
                        entry[key] = v[:255 if key == "address" else 90]
                if entry.get("name"):
                    cleaned.append(entry)
            result[category] = cleaned
        # Hypixel is an immutable built-in server; importing a backup cannot delete or replace it.
        hypixel = next((e for e in result["servers"] if str(e.get("address", "")).lower() == "hypixel.net"), None)
        if hypixel:
            hypixel.update({"name": "Hypixel", "address": "hypixel.net", "builtIn": "hypixel"})
        else:
            result["servers"].insert(0, {"name": "Hypixel", "address": "hypixel.net", "builtIn": "hypixel"})
        return result

    def save_lava_backup(self, library, store_preferences=None):
        if not WINDOW:
            return {"ok": False, "error": "Lava's desktop save dialog isn't available"}
        try:
            cleaned = self._clean_library(library)
            name = 'Lava-backup-' + datetime.date.today().isoformat() + '.lava.json'
            dialog = WINDOW.create_file_dialog(webview.FileDialog.SAVE, save_filename=name,
                                               file_types=("Lava backup (*.lava.json)", "JSON files (*.json)"))
            if not dialog:
                return {"ok": False, "cancelled": True}
            target = Path(dialog[0])
            if not target.name.lower().endswith('.json'):
                target = target.with_name(target.name + '.lava.json')
            preferences = store_preferences if isinstance(store_preferences, dict) else {}
            payload = {"format": "lava-library-backup", "schema_version": 1,
                       "lava_version": APP_VERSION, "exported_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                       "library": cleaned, "launcher_settings": self._backup_settings(),
                       "store_preferences": {k: v for k, v in preferences.items() if k in
                                            ("storeVersion", "versionChannel", "storeProvider", "storeType", "storeSort", "storeEnvironment")
                                            and isinstance(v, str) and len(v) < 100}}
            save_json(target, payload)
            return {"ok": True, "path": str(target), "entries": sum(len(cleaned[k]) for k in ("servers", "worlds", "modpacks"))}
        except Exception as ex:
            return {"ok": False, "error": f"Unable to save Lava backup: {ex}"}

    def _backup_settings(self):
        return {k: self.settings.get(k) for k in ("ram_mb", "theme", "gradient_start", "gradient_end")}

    def restore_lava_backup(self):
        if not WINDOW:
            return {"ok": False, "error": "Lava's desktop open dialog isn't available"}
        try:
            dialog = WINDOW.create_file_dialog(webview.FileDialog.OPEN,
                                               file_types=("Lava backup (*.lava.json)", "JSON files (*.json)"))
            if not dialog:
                return {"ok": False, "cancelled": True}
            source = Path(dialog[0])
            if source.stat().st_size > 16_000_000:
                raise ValueError("File exceeds 16 MB backup limit")
            payload = json.loads(source.read_text(encoding="utf-8"))
            if not isinstance(payload, dict) or payload.get("format") != "lava-library-backup" or payload.get("schema_version") != 1:
                raise ValueError("This is not a supported Lava backup")
            library = self._clean_library(payload.get("library"))
            settings = payload.get("launcher_settings")
            if not isinstance(settings, dict):
                raise ValueError("Backup is missing launcher settings")
            return {"ok": True, "library": library, "launcher_settings": settings,
                    "store_preferences": payload.get("store_preferences") or {},
                    "entries": sum(len(library[k]) for k in ("servers", "worlds", "modpacks")),
                    "from": str(source)}
        except Exception as ex:
            return {"ok": False, "error": f"Unable to restore Lava backup: {ex}"}

    def apply_backup_settings(self, settings):
        if not isinstance(settings, dict):
            return {"ok": False, "error": "Invalid backup settings"}
        theme = settings.get("theme", "ocean")
        if theme not in {"ocean", "ember", "violet", "forest", "custom"}:
            theme = "ocean"
        colors = [settings.get("gradient_start", "#22384b"), settings.get("gradient_end", "#101e2b")]
        if any(not isinstance(c, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", c) for c in colors):
            colors = ["#22384b", "#101e2b"]
        self.settings.update({"theme": theme, "gradient_start": colors[0],
                              "gradient_end": colors[1], "ram_mb": self._clamp_ram(settings.get("ram_mb", 4096))})
        save_json(SETTINGS_FILE, self.settings)
        return {"ok": True, "settings": self.settings}

    def open_minecraft_folder(self):
        entry = self.local_minecraft()
        folder = Path(entry["path"])
        if not folder.is_dir():
            return {"ok": False, "error": "No .minecraft folder was detected. Install Minecraft with the official launcher first."}
        try:
            if os.name == "nt":
                os.startfile(str(folder))
            elif sys.platform == "darwin":
                subprocess.Popen(["open", str(folder)])
            else:
                subprocess.Popen(["xdg-open", str(folder)])
            return {"ok": True, "message": "Opened your existing .minecraft folder."}
        except Exception as ex:
            return {"ok": False, "error": f"Unable to open .minecraft: {ex}"}

    def open_official_launcher(self):
        """Use the installed Microsoft/Mojang launcher and its own account checks."""
        if os.name != "nt":
            return {"ok": False, "error": "This shortcut currently supports Windows. Open your official Minecraft Launcher normally."}
        pf = os.environ.get("ProgramFiles", r"C:\Program Files")
        pf86 = os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")
        candidates = [Path(pf) / "Minecraft Launcher" / "MinecraftLauncher.exe",
                      Path(pf86) / "Minecraft Launcher" / "MinecraftLauncher.exe"]
        for candidate in candidates:
            if candidate.is_file():
                try:
                    subprocess.Popen([str(candidate)], cwd=str(candidate.parent))
                    return {"ok": True, "message": "Opened Minecraft Launcher. It will use its own sign-in/session."}
                except OSError:
                    pass
        try:
            # Windows may register the official launcher using this URI scheme.
            os.startfile("minecraft://")
            return {"ok": True, "message": "Asked Windows to open the official Minecraft Launcher."}
        except OSError:
            return {"ok": False, "error": "Couldn't find an installed Minecraft Launcher. Open it from Windows Start or install it from minecraft.net."}

    def open_lava_files(self):
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        # Game folder intentionally only appears after first launch.
        try:
            if os.name == "nt":
                os.startfile(str(DATA_DIR))
            elif sys.platform == "darwin":
                subprocess.Popen(["open", str(DATA_DIR)])
            else:
                subprocess.Popen(["xdg-open", str(DATA_DIR)])
            return {"ok": True, "path": str(DATA_DIR)}
        except Exception as ex:
            return {"ok": False, "error": str(ex)}

    def check_updates(self):
        url = update_feed_url()
        if not url:
            return {"ok": False, "version": APP_VERSION,
                    "message": "Lava v" + APP_VERSION + " is installed. An online update feed isn't configured yet. Once a release server exists, Lava can check it here."}
        if urlparse(url).scheme != "https":
            return {"ok": False, "error": "Lava's update manifest must use HTTPS."}
        try:
            req = urllib.request.Request(url, headers={"User-Agent": f"LavaLauncher/{APP_VERSION}"})
            with urllib.request.urlopen(req, timeout=8) as response:
                payload = response.read(100_000)
            manifest = json.loads(payload)
            latest = str(manifest["version"])
            if not re.fullmatch(r"\d+(?:\.\d+){1,4}", latest):
                raise ValueError("Invalid version in update feed")
            release = str(manifest.get("release_url", ""))
            if release and urlparse(release).scheme != "https":
                release = ""
            parse = lambda v: tuple(map(int, v.split(".")))
            newer = parse(latest) > parse(APP_VERSION)
            return {"ok": True, "current": APP_VERSION, "latest": latest,
                    "update_available": newer, "release_url": release,
                    "message": f"Lava v{latest} is available!" if newer else f"Lava v{APP_VERSION} is up to date according to the configured release feed."}
        except Exception as ex:
            return {"ok": False, "error": f"Couldn't check Lava updates: {ex}"}

    def open_release(self, url):
        # Only allow the configured manifest's release URL. No running downloaded code.
        feed = update_feed_url()
        if not feed or not str(url).startswith("https://"):
            return {"ok": False, "error": "No trusted update feed is configured."}
        result = self.check_updates()
        if not result.get("ok") or not result.get("release_url") or result["release_url"] != url:
            return {"ok": False, "error": "Release URL could not be verified."}
        webbrowser.open(url)
        return {"ok": True}

    def list_versions(self):
        try:
            return {"ok": True, "versions": [{"id": v["id"], "type": v["type"]}
                    for v in mcl.utils.get_version_list() if v.get("id")]}
        except Exception as ex:
            return {"ok": False, "error": str(ex), "versions": []}

    def launch(self, version):
        if not self.account:
            return {"ok": False, "error": "Sign in with the Microsoft account that owns Minecraft: Java Edition first."}
        version = str(version).strip()
        if not re.fullmatch(r"[A-Za-z0-9._-]{1,48}", version):
            return {"ok": False, "error": "Invalid Minecraft version."}
        if not self.lock.acquire(blocking=False):
            return {"ok": False, "error": "An installation or launch is already running."}
        started = False
        try:
            if version not in {v["id"] for v in mcl.utils.get_version_list()}:
                return {"ok": False, "error": "Version not found in Minecraft's official version manifest."}
            # Refresh cached access before launching with the user's authenticated account.
            cid = client_id()
            token = keyring.get_password(TOKEN_SERVICE, cid) if cid else None
            if token:
                auth = mcl.microsoft_account.complete_refresh(cid, None, None, token)
                keyring.set_password(TOKEN_SERVICE, cid, auth["refresh_token"])
                self.account = auth
            self.game_dir.mkdir(parents=True, exist_ok=True)
            worker = threading.Thread(target=self._launch_worker,
                    args=(version, dict(self.account), self.settings["ram_mb"]), daemon=True)
            worker.start()
            started = True
            return {"ok": True, "message": f"Preparing Minecraft {version}…"}
        except Exception as ex:
            return {"ok": False, "error": f"Unable to start Minecraft: {ex}"}
        finally:
            if not started:
                self.lock.release()

    def _notify(self, message):
        if WINDOW:
            try:
                WINDOW.evaluate_js(f"window.lavaDesktopStatus({json.dumps(str(message))})")
            except Exception:
                pass

    def _launch_worker(self, version, account, ram_mb):
        threading.current_thread().name = "_launch_worker"
        try:
            self._notify(f"Checking files for Minecraft {version}…")
            mcl.install.install_minecraft_version(version, str(self.game_dir))
            options = {"username": account["name"], "uuid": account["id"],
                       "token": account["access_token"], "launcherName": "Lava",
                       "launcherVersion": APP_VERSION, "jvmArguments": [f"-Xmx{ram_mb}M"]}
            command = mcl.command.get_minecraft_command(version, str(self.game_dir), options)
            self._notify(f"Starting Minecraft {version} as {account['name']} with {ram_mb//1024:.1f} GB allocated…")
            subprocess.Popen(command, cwd=str(self.game_dir))
            self._notify(f"Minecraft {version} started. Enjoy your game!")
        except Exception as ex:
            self._notify(f"Minecraft launch failed: {ex}")
        finally:
            self.lock.release()


    # Lava 0.10.0: Import existing Minecraft metadata without using the official launcher.
    def discover_installed(self):
        return discover()

    def list_local_screenshots(self):
        return {"ok": True, "items": screenshots()}

    def screenshot_full(self, name):
        try:
            return {"ok": True, "image": as_preview(screenshot_path(name), (1700, 980), 85)}
        except Exception as ex:
            return {"ok": False, "error": str(ex)}

    def rename_screenshot(self, old_name, new_name):
        try:
            src = screenshot_path(old_name)
            new_name = str(new_name).strip()
            if not new_name.lower().endswith('.png'):
                new_name += '.png'
            if (not re.fullmatch(r'[a-zA-Z0-9 _().\-]{1,130}\.png', new_name)
                    or new_name in ('.png', '..png')):
                raise ValueError('Use letters, numbers, spaces, dots, dashes and underscores.')
            dst = src.with_name(new_name)
            if dst.exists() and dst != src:
                raise FileExistsError('A screenshot with that name already exists')
            src.rename(dst)
            return {"ok": True, "name":dst.name}
        except Exception as ex:
            return {"ok": False, "error":str(ex)}

    def screenshot_banner(self, name):
        try:
            return {"ok":True,"banner":as_preview(screenshot_path(name),(1600,700),83)}
        except Exception as ex:
            return {"ok":False,"error":str(ex)}

    def screenshot_clipboard(self, name):
        if os.name != 'nt':
            return {"ok":False,"error":"Image clipboard copy is currently supported on Windows."}
        try:
            path = screenshot_path(name)
            with Image.open(path) as im:
                im.load()
                im = im.convert('RGB')
                im.thumbnail((2560,1440))
                bf = io.BytesIO(); im.save(bf,'BMP'); dib = bf.getvalue()[14:]
            # Use Windows CF_DIB; ownership of the buffer transfers to the clipboard.
            kernel32 = ctypes.windll.kernel32; user32 = ctypes.windll.user32
            kernel32.GlobalAlloc.argtypes = [ctypes.c_uint,ctypes.c_size_t]
            kernel32.GlobalAlloc.restype = ctypes.c_void_p
            kernel32.GlobalLock.argtypes = [ctypes.c_void_p]
            kernel32.GlobalLock.restype = ctypes.c_void_p
            kernel32.GlobalUnlock.argtypes = [ctypes.c_void_p]
            user32.SetClipboardData.argtypes = [ctypes.c_uint,ctypes.c_void_p]
            user32.SetClipboardData.restype = ctypes.c_void_p
            buffer = kernel32.GlobalAlloc(0x0002,len(dib))
            if not buffer: raise OSError('Could not allocate clipboard memory')
            ptr = kernel32.GlobalLock(buffer)
            if not ptr: raise OSError('Could not lock clipboard memory')
            ctypes.memmove(ptr,dib,len(dib));kernel32.GlobalUnlock(buffer)
            if not user32.OpenClipboard(None): raise OSError('Clipboard is in use')
            try:
                user32.EmptyClipboard()
                if not user32.SetClipboardData(8,buffer): raise OSError('Could not copy image')
                buffer = None
            finally:
                user32.CloseClipboard()
            return {"ok":True}
        except Exception as ex:
            return {"ok":False,"error":str(ex)}

    def launch_target(self, version, address='', world='', profile=''):
        """Launch with a real authenticated Minecraft session; never scrape launcher tokens."""
        if not self.account:
            return {"ok":False,"login_required":True,
                    "error":"Joining servers requires a Microsoft account signed into Lava. Local files alone are not a multiplayer login."}
        installed = discover()
        if not installed.get('ok'):
            return {"ok":False,"error":installed.get('error')}
        version = str(version or '').strip()
        if version not in installed['versions']:
            return {"ok":False,"error":"That version is not installed in .minecraft. Choose one from your installed versions."}
        address = str(address or '').strip()
        if address and (not re.fullmatch(r'[a-zA-Z0-9._:-]{1,253}',address)):
            return {"ok":False,"error":"Invalid server address."}
        world = str(world or '').strip()
        if world and (not world in [w['folder'] for w in installed['worlds']]):
            return {"ok":False,"error":"World folder not found in your saves directory."}
        if not self.lock.acquire(blocking=False):
            return {"ok":False,"error":"Minecraft is already being prepared."}
        thread=threading.Thread(target=self._launch_installed_worker,
            args=(version,address,world,self.settings['ram_mb']),daemon=True)
        thread.start()
        return {"ok":True,"message":f"Preparing installed Minecraft {version}…"}

    def _progress(self,message,progress=None):
        if WINDOW:
            try:
                WINDOW.evaluate_js('window.lavaLaunchStatus(' + json.dumps({
                    'message':str(message),'progress':progress}) + ')')
            except Exception: pass

    def _launch_installed_worker(self, version, address, world, ram_mb):
        try:
            self._progress('Checking existing Minecraft files…',8)
            cid=client_id()
            token=keyring.get_password(TOKEN_SERVICE,cid) if cid else None
            if token:
                fresh=mcl.microsoft_account.complete_refresh(cid,None,None,token)
                keyring.set_password(TOKEN_SERVICE,cid,fresh['refresh_token'])
                self.account=fresh
            options={'username':self.account['name'],'uuid':self.account['id'],
                     'token':self.account['access_token'],'launcherName':'Lava',
                     'launcherVersion':APP_VERSION,'jvmArguments':[f'-Xmx{ram_mb}M']}
            if address:
                # Modern Java Edition (1.20+ and year-based 25.x/26.x) uses Quick Play.
                # Older releases still use --server/--port.
                pairs = [(int(a), int(b)) for a,b in re.findall(r'(?<![0-9])(\d{1,2})\.(\d{1,2})(?![0-9])', version)]
                modern = any((a == 1 and b >= 20) or a >= 25 for a,b in pairs)
                if modern:
                    options['quickPlayMultiplayer'] = address
                else:
                    host,sep,port=address.rpartition(':')
                    if sep and port.isdigit():
                        options['server']=host;options['port']=port
                    else: options['server']=address
            if world: options['quickPlaySingleplayer']=world
            self._progress('Preparing Java and game arguments…',40)
            command=mcl.command.get_minecraft_command(version,str(minecraft_dir()),options)
            self._progress('Starting Minecraft '+version+'…',85)
            subprocess.Popen(command,cwd=str(minecraft_dir()))
            self._progress('Minecraft started.',100)
        except Exception as ex:
            self._progress('Launch failed: '+str(ex),-1)
        finally:
            self.lock.release()

    def request_factory_reset(self):
        """Erase ONLY Lava-owned state after WebView closes. Never touch .minecraft."""
        global RESET_AFTER_EXIT
        if self.lock.locked():
            return {"ok":False,"error":"Close Minecraft or finish the current launch first."}
        RESET_AFTER_EXIT=True
        RESET_MARKER.write_text('pending',encoding='utf-8')
        self.sign_out()
        if WINDOW:
            threading.Thread(target=WINDOW.destroy,daemon=True).start()
        return {"ok":True,"message":"Lava is resetting and will close. Reopen Lava to begin again."}

    def exit_app(self):
        def close():
            if WINDOW:
                WINDOW.destroy()
        threading.Thread(target=close, daemon=True).start()
        return {"ok": True}


def main():
    global WINDOW
    if RESET_MARKER.exists():
        try:
            shutil.rmtree(DATA_DIR, ignore_errors=False)
            RESET_MARKER.unlink()
        except OSError as ex:
            print('Lava pending reset cleanup:',ex)
    api = LavaAPI()
    WINDOW = webview.create_window(f"Lava Launcher v{APP_VERSION}", str(BASE / "lava.html"),
                                   js_api=api, width=1380, height=880, min_size=(970, 660),
                                   background_color="#171d25")
    webview.start(debug=False, private_mode=False, storage_path=str(DATA_DIR / "webview"))
    if RESET_AFTER_EXIT:
        try:
            shutil.rmtree(DATA_DIR)
            RESET_MARKER.unlink(missing_ok=True)
        except OSError as ex:
            print("Lava reset: some locked files may remain:", ex)


if __name__ == "__main__":
    main()
