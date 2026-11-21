# Lava Launcher — Development notes

Lava Desktop v0.10.1 is a Windows development prototype. The repository contains the Python backend (`launcher.py`, `native_v10.py`), HTML/CSS/JavaScript interface, dependency list, example configuration, and build scripts. The browser-style interface is hosted in a native application window using `pywebview`.

## Running the source

On Windows with Python 3.11 or newer installed, open a terminal in the repository root:

```cmd
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe launcher.py
```

The included `START_LAVA.bat` is an alternative startup script for a trusted local setup. Do not disable Windows security protections to run development builds.

## Capabilities and limitations

- The Store uses the Modrinth API. CurseForge browsing requires separate authorized API integration.
- Library discovery can read local `.minecraft` metadata for worlds, servers, launcher versions and screenshots. It does not copy official launcher credentials.
- Server status and player counts depend on third-party services that can be unavailable or cache results.
- Modpack entries and import are partly metadata-only; installing all mod loaders and dependencies is not complete.
- Authenticated joining/direct game launch requires Microsoft OAuth plus Minecraft Services authorization. There is currently no approved application ID bundled with Lava. The existing OAuth redirect in the source is the legacy desktop redirect and must be updated to match the project's registered redirect (`http://localhost`) before testing.
- Friends and messaging need a separate secure online service and are not functional yet.
- Lava backups are for launcher settings, not the actual worlds or game assets.

## Public demo assets

The `assets/banners/` images in this public source package are **original placeholder graphics**. User-supplied art from a personal development build is not included because public redistribution rights have not been established. Replace placeholders only with artwork you have permission to publish.

## Account credentials

Do **not** commit `lava_config.json`, live OAuth tokens, Microsoft account data, WebView profile state, personal screenshots, world saves, or exported Lava backups. Sample configuration files are intentionally blank. Never distribute Microsoft client secrets for a desktop application.

This project is an independent third-party launcher, not affiliated with Mojang Studios, Microsoft, Valve, Modrinth, or CurseForge.
