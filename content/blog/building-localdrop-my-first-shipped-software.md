---
title: 'Why I Built LocalDrop: My First Shipped Software and the Full Engineering Cycle'
date: '2026-11-28'
description: 'How I built LocalDrop from hotspot ping tests to a tested, secured, and packaged PyQt5 + Flask app to learn the professional software lifecycle.'
---

> **Executive Summary & Key Takeaways:**
> - **Primary Premise:** LocalDrop is a two-way local-network file transfer application between a phone browser and a Windows/Linux PC—built not to invent a brand-new product category, but to learn and execute the complete professional software development lifecycle from prototype to packaged release.
> - **Methodology / Stack:** Python 3.12, PyQt5 desktop UI (`1,484`-line `main.py`), embedded threaded Flask/Werkzeug server, OS-level IPv4/firewall diagnostics (`netdiag.py`), vanilla HTML/CSS/JS mobile web UI (`templates/index.html`), 20 `unittest` cases, and PyInstaller + Inno Setup + GitHub Actions packaging.
> - **Core Finding / Metric:** Reaches `242.83 MiB/s` (`254.63 MB/s`) upload and `238.58 MiB/s` (`250.17 MB/s`) download on 50 MiB local loopback benchmarks (`scripts/benchmark.py`), passes 20 automated tests in `0.813s`, and transfers files offline over a phone hotspot with zero companion mobile app.
> - **Direct Answer:** Building software around an already-proven idea removes product ambiguity so you can focus 100% on real engineering craft: OS network discovery, cross-thread GUI synchronization, defense-in-depth security boundaries, automated testing, reproducible benchmarking, native installers, and honest verification tracking.

I know AirDrop, LocalSend, and Snapdrop already exist. Moving photos or PDFs between a phone and a laptop over Wi-Fi is not a novel startup pitch.

That was the whole point.

Until **LocalDrop**, most of my programming lived inside scripts, notebooks, and focused systems experiments. When you only write single-file scripts, you never have to worry about Windows Firewall silently dropping packets on a phone hotspot, PyQt5 crashing because a background Flask thread touched a widget, or an Inno Setup installer leaving stale firewall rules behind on uninstall.

I wanted to build my **first real piece of end-to-end software**—something you can launch from a desktop icon, scan with a phone that has **zero internet access**, and trust with real files. Picking a familiar problem let me obsess over the **professional software development cycle**: architecture, networking, concurrency, threat modeling, testing, benchmarking, CI/CD, packaging, and documentation.

![Animated end-to-end LocalDrop workflow showing desktop QR pairing, mobile file selection, upload progress, and desktop confirmation](/images/writing/building-localdrop-my-first-shipped-software/localdrop-workflow.gif "End-to-end LocalDrop workflow: pairing via QR code, uploading from a mobile browser with live progress, and confirming receipt on the desktop.")

## 1. From Hotspot `ping` Experiments to Five Versioned Milestones

LocalDrop started with an **Oppo A17** mobile hotspot, two **Windows 10** computers, and curiosity. Before writing a single Flask route, I connected both machines to my phone's hotspot, inspected how DHCP leased private IPv4 addresses, ran `ping` across them, and tested Windows SMB sharing. Seeing two machines exchange packets with mobile data turned off gave me the core thesis: **the local Wi-Fi link is enough—no cloud relay or internet required**.

From there, the project evolved across five distinct stages in Git history:

| Version / Tag | Key Engineering Milestones |
|---|---|
| **`v0.0`** (`AirDrop_v0.0`) | 113-line CLI Flask script (`app.py`), random 128-bit URL token, static QR PNG opened via `webbrowser`, `werkzeug.utils.secure_filename`, and commit `1dc19a4` fixing the frontend JSON boundary bug. |
| **`v0.1`** (`AirDrop_v0.1`) | Replaced the terminal script with a PyQt5 GUI (`main.py`), embedded Werkzeug `make_server` thread, folder picker, and `run_windows.bat` / `run_linux.sh` launchers. |
| **`v0.2`** (`LocalDrop_v0.2`) | Rebranded from AirDrop to **LocalDrop** (`8eb1f84`), introduced the dark two-column UI, live received list via `UploadSignals`, `QSystemTrayIcon` alerts, and drag-and-drop mobile uploads with an XHR progress bar (`d6ec9fa`). |
| **`v0.3`** (`LocalDrop_v0.3`, `1.2.1`) | Added `netdiag.py` (multi-adapter IPv4 ranking + Windows/Linux firewall inspection), `DeviceApprovals`, `BLOCKED_EXTENSIONS`, atomic `.part` + `os.replace` writes, `build.py`, GitHub Actions (`build.yml`), and `tests/test_localdrop.py`. |
| **`v0.4`** (`LocalDrop_v0.4`, `0.4.0`) | Expanded to two-way transfers: `SharedFiles` registry, `/shared/<token>`, `/download/<token>/<file_id>`, the **03 / SEND TO PHONE** desktop queue, and the mobile **Receive from PC** tab with 3.5-second live polling. |

### The Bug That Taught Me Boundary Discipline (`v0.0`)

One of my earliest lessons happened in the very first working upload prototype (`AirDrop_v0.0`). I selected a file on my phone, hit upload, and watched the mobile webpage immediately flash an error. Yet when I checked the `received/` folder on disk, **the file was right there**.

The Flask route had returned `{"status": "success", "files": saved}`, while my original frontend template tried to format `"successfully uploaded" + result.file.json(",")`—both the wrong key (`file` instead of `files`) and a nonexistent `.json()` method instead of `.join(",")`. That threw a JavaScript `TypeError` inside `try/catch` *after* the server had already saved the file.

Fixing it in commit `1dc19a4` taught me a habit that shaped the rest of the project: **never trust a green HTTP `200` or clean Python traceback in isolation—verify across the actual system boundary**.

## 2. Two-Way Product Experience Without a Companion Mobile App

Forcing someone to install an Android APK or iOS TestFlight build just to pull one PDF off a laptop defeats the convenience of local sharing. Instead, LocalDrop serves a single self-contained mobile web app (`templates/index.html`, 509 lines of vanilla HTML5, CSS3, and JavaScript) directly from the PC's embedded Flask server.

I also aligned the PyQt5 QSS stylesheet and the mobile CSS around the same dark design system (`#101010` canvas, `#1b1b1b` cards, `#343434` borders, and `#e63946` red accents) so both sides feel like one cohesive tool.

![LocalDrop desktop main window showing storage destination, Send to Phone queue, empty Received Files feed, QR code, and github.com/itsthemaverick footer](/images/writing/building-localdrop-my-first-shipped-software/desktop-main-window.png "LocalDrop v0.4.0 desktop window: configurable storage folder, drag-and-drop Send to Phone queue, live Received Files feed, and QR pairing panel.")

On the desktop (`LocalDropWindow`), four numbered panels organize every action:

- **`01 / STORAGE DESTINATION`:** Persists your chosen folder in `settings.json` inside the OS config directory (`%APPDATA%\LocalDrop` on Windows, `$XDG_CONFIG_HOME/LocalDrop` on Linux), defaulting to `<DesktopLocation>/LocalDrop` resolved via `QStandardPaths`.
- **`02 / CONNECT YOUR DEVICE`:** Displays a custom `QPainter`-rendered QR code (`QRWidget`), an **Address** switcher dropdown when multiple LAN adapters exist, **Test connection**, **Last request seen** telemetry, a collapsible phone-troubleshooting guide, and the **"Ask me before allowing a new device"** approval toggle.
- **`03 / SEND TO PHONE`:** An opt-in drag-and-drop queue (`SharedFiles`) that exposes explicitly selected documents to your phone—never your broader filesystem.
- **`04 / RECEIVED FILES`:** Prepends the latest 30 incoming filenames in green confirmation rows and fires native OS system-tray notifications (`QSystemTrayIcon`).

![Side-by-side Android browser screenshots showing Send to PC and Receive from PC tabs running on a hotspot with no internet connection](/images/writing/building-localdrop-my-first-shipped-software/mobile-offline-two-way.png "Real Oppo A17 Android browser captures over a phone hotspot with no internet connection: Send to PC (left) and Receive from PC with live badge sync (right).")

Look closely at the top status bar in the Android screenshots above: **`No internet connection`**. The phone is acting purely as an IEEE 802.11 access point and DHCP gateway while Chrome renders the local HTTP app served straight from my PC.

![Three-step mobile upload progression showing file selection, 26% XHR upload progress bar, and verified upload confirmation cards](/images/writing/building-localdrop-my-first-shipped-software/mobile-upload-pipeline.png "Mobile upload pipeline in templates/index.html: multi-file selection, live XMLHttpRequest.upload progress tracking, and per-file confirmation notices.")

When files finish uploading, both sides reflect reality immediately—the mobile UI renders per-file confirmation cards, and the desktop updates `04 / RECEIVED FILES` and flips the header status pill to `● FILE RECEIVED`.

![LocalDrop desktop window after receiving meeting_notes.pdf and sunset_photo.jpg showing green confirmation rows and FILE RECEIVED status pill](/images/writing/building-localdrop-my-first-shipped-software/desktop-file-received.png "Desktop window immediately after receiving two uploads over local HTTP, updating the header status pill and 04 / RECEIVED FILES feed.")

## 3. Real-World Networking & OS Diagnostics (`netdiag.py`)

If you ask Python's `socket.gethostname()` for your IP on a modern Windows developer laptop, it will happily hand you a `172.x` WSL2 bridge, a Hyper-V `vEthernet` switch, Docker, VirtualBox, or a Tailscale CGNAT address (`100.x`) instead of your Wi-Fi card. And even when you pick the right IP, Windows frequently classifies a new phone hotspot as a **Public** network—causing Windows Defender Firewall to silently drop inbound TCP `SYN` packets from your phone.

Solving those two real-world failure modes turned into [`netdiag.py`](https://github.com/itsthemaverick/LocalDrop/blob/main/netdiag.py) (782 lines), one of my favorite engineering pieces in the repo:

1. **Bind `0.0.0.0`, advertise dynamically:** Werkzeug binds `("0.0.0.0", port)` across `PORT_CANDIDATES = range(5000, 5020)` (falling back to OS ephemeral port `0`). That way, switching adapters in the **Address** dropdown updates the QR URL without restarting the HTTP server.
2. **Two-stage IP discovery:** At startup, `probe_default_route_ip()` opens a `SOCK_DGRAM` socket and connects to `192.0.2.1:80` (RFC 5737 TEST-NET-1—zero packets actually leave the machine) for an instant initial IP guess. In the background, `enumerate_ipv4_candidates()` queries PowerShell (`Get-NetConnectionProfile`, `Get-NetIPAddress`, `Get-NetAdapter`) on Windows or `ip -4 -o addr show scope global` on Linux.
3. **Adapter scoring:** `rank_ipv4_candidates()` strips loopback, `169.254.x.x` link-local, and disconnected interfaces, heavily penalizes virtual/VPN interfaces (`-120` for `vethernet`, `wsl`, `hyper-v`, `docker`, `tailscale`, `wireguard`, `zerotier`, `openvpn`), and boosts Windows Mobile Hotspot (`192.168.137.0/24`, `+36`) and physical Wi-Fi (`+35`) over Ethernet (`+25`).
4. **Firewall inspection & one-click UAC fix:** On Windows, `netdiag.py` inspects `HNetCfg.FwPolicy2` rules against the active adapter's `NetworkCategory`. If the PC is on a *Public* hotspot without an allow rule—or has an explicit *Block* rule—the GUI surfaces an alert banner with an **Allow on this network** button invoking `ShellExecuteW(..., "runas", ...)` via UAC. On Linux, it inspects `ufw` and `firewalld` and shows the exact `5000:5019/tcp` allow command.
5. **Loopback + LAN self-test:** Clicking **Test connection** hits both `127.0.0.1` and the advertised LAN IP using a per-launch `SELF_TEST_NONCE` in `X-LocalDrop-SelfTest` so self-checks verify reachability without polluting **Last request seen**.

## 4. Thread-Safe Concurrency Between PyQt5 and Flask

PyQt5 enforces a strict rule: **only the main GUI thread may touch widgets**. Meanwhile, Werkzeug's threaded WSGI server (`make_server("0.0.0.0", port, app, threaded=True)`) spawns daemon worker threads for incoming phone requests, and `netdiag.py` runs PowerShell/socket probes in short-lived background threads.

To keep the desktop window responsive without race conditions, I built a clean cross-thread boundary:

```text
Werkzeug Worker Threads ──(UploadSignals pyqtSignal)──▶ Qt Main Thread (LocalDropWindow)
        │                                                       │
        └── blocks on threading.Event (up to 90s) ◀── resolve() ┘ (QMessageBox Allow / Block)
```

- **`UploadSignals` (`QObject`):** Worker threads never mutate labels or lists directly; they emit `received`, `sent`, `approval_requested`, `request_seen`, `env_probed`, `self_test_done`, and `server_error`, which Qt queues safely onto the main event loop.
- **Locked state registries:** `SharedFiles`, `RequestTracker`, and `DeviceApprovals` each guard mutable dictionaries and fields behind `threading.Lock`.
- **Interactive blocking approval:** When `"Ask me before allowing a new device"` is checked, an upload or download from an unseen IP pauses inside `DeviceApprovals.check(ip)` on a `threading.Event` (up to `APPROVAL_TIMEOUT = 90` seconds) until the owner clicks **Allow** or **Block** in a modal `QMessageBox`—and `closeEvent()` calls `approvals.release_all()` so waiting threads unblock cleanly on exit.

## 5. Defense-in-Depth Security & Atomic File Writes

Even on a local Wi-Fi network, binding `0.0.0.0` means you have to think carefully about trust boundaries. Every request passes through layered server-side gates before touching the disk:

| Security Control | Implementation in `main.py` | Threat Mitigated |
|---|---|---|
| **Local-network IP gate** | `@app.before_request` (`is_local_client`) accepts RFC 1918 private, loopback, link-local, CGNAT `100.64.0.0/10`, and `::ffff:...` IPv4-mapped IPv6; rejects public IPs with `403`. | Accidental exposure if a user port-forwards a router. |
| **160-bit token + constant-time check** | `TOKEN = secrets.token_urlsafe(20)` validated via `secrets.compare_digest()`. | Guessing upload/download URLs on the LAN. |
| **Token log suppression** | `logging.getLogger("werkzeug").setLevel(logging.ERROR)` + `RequestTracker` logs `(ip, timestamp, outcome)` only. | Prevents `TOKEN` in query/path URLs from leaking into `localdrop.log`. |
| **Unicode-safe path sanitisation** | `safe_filename()` normalizes `NFC`, strips `/` & `\`, removes illegal chars, prefixes Windows reserved names (`CON`, `NUL`, `COM1`–`9`, `LPT1`–`9`), caps UTF-8 stems at 200 bytes. | Path traversal (`../../etc/passwd`) and Windows device-name crashes. |
| **Executable extension blocklist** | `BLOCKED_EXTENSIONS` refuses 24 runnable types (`.exe`, `.msi`, `.bat`, `.ps1`, `.vbs`, `.js`, `.jar`, `.dll`, `.appimage`, `.desktop`, etc.). | Dropping directly runnable payloads onto the PC. |
| **Atomic claim + `.part` staging** | `reserve_destination()` claims `photo.jpg` / `photo_1.jpg` via `open(..., "xb")`, writes `<name>.part`, promotes with `os.replace(part, final)`, unlinks both on error. | Filename race conditions and corrupt half-written uploads. |
| **Size & disk-space guards** | `MAX_REQUEST_BYTES = 8 GiB` (`413`) and `MIN_FREE_BYTES = 50 MiB` buffer (`507 Insufficient Storage`). | Filling the host OS volume to 0 bytes. |
| **PC-to-phone allowlist** | `SharedFiles` maps explicitly picked/dropped files to opaque random 8-byte `file_id` tokens; `/shared/<token>` never exposes local paths. | Arbitrary filesystem browsing from the phone. |
| **HTTP response headers** | Sets `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, and `X-Content-Type-Options: nosniff`. | Stale caching and referrer leakage. |

Here is the core upload reservation and `.part` atomic promotion path in `main.py`:

```python
final = reserve_destination(folder, name)  # exclusive "xb" open prevents parallel filename races
part = final.with_name(final.name + ".part")
try:
    uploaded_file.save(part)
    os.replace(part, final)
except BaseException:
    part.unlink(missing_ok=True)
    final.unlink(missing_ok=True)
    raise
```

### Honest Threat-Model Boundaries

Part of practicing professional engineering is refusing to oversell what your security controls guarantee. LocalDrop currently uses **plain HTTP** (not TLS/HTTPS) so mobile browsers connect after scanning the QR code without hitting confusing self-signed certificate warnings. That means payloads and the URL token travel in cleartext over the Wi-Fi link, there is no `403` rate limiting yet, and `DeviceApprovals` caches trust by IPv4 address. For that reason, the documentation explicitly scopes LocalDrop to **trusted private LANs and personal hotspots**, never public café Wi-Fi.

## 6. Automated Tests, Reproducible Benchmarks, and Packaging

To move past *"it worked on my laptop once"*, I built automated verification, reproducible performance measurement, and OS packaging into the repository:

### 20 Automated `unittest` Cases (`tests/test_localdrop.py`)

`tests/test_localdrop.py` (482 lines) tests both `netdiag.py` and the Flask/Qt layers—using `QT_QPA_PLATFORM=offscreen` when PyQt5 is present and falling back to `_install_qt_stub_if_missing()` in headless environments. Across 20 tests (observed passing in **`0.813s`** on Windows 10, Python `3.12.4`, PyQt5 `5.15.11`), the suite verifies:

- Virtual/VPN adapter deprioritization and Windows Mobile Hotspot (`192.168.137.1`) ranking.
- Windows `NetworkCategory` / `HNetCfg.FwPolicy2` parsing and Linux `ufw`/`firewalld` hints.
- `is_local_client()` edge cases (CGNAT `100.64.0.5`, `::ffff:...`, public IP rejection).
- Non-leaking `RequestTracker` behavior (confirming `TOKEN` never appears in logs or tracker records).
- Multi-threaded `DeviceApprovals` blocking, resolution, and `release_all()` unblocking.
- `safe_filename()` traversal/reserved-name/Unicode handling, `BLOCKED_EXTENSIONS` enforcement, atomic `"xb"` suffixing, `400`/`413`/`507` HTTP error paths, `SharedFiles` path non-disclosure, and `1366×728` desktop layout bounds.

### Loopback Throughput Benchmarks (`scripts/benchmark.py`)

To measure server and disk I/O overhead without Wi-Fi variance, `scripts/benchmark.py` spins up LocalDrop's real Flask/Werkzeug server on `127.0.0.1` and runs 3 repetitions across `1 MiB`, `10 MiB`, and `50 MiB` payloads (observed on Windows 10, 4 CPUs, `15.9 GiB` RAM, Python `3.12.4`):

| Direction | Payload Size | Mean Time (s) | Median Time (s) | Mean Throughput (MiB/s) | Mean Throughput (MB/s) |
|---|---:|---:|---:|---:|---:|
| `upload` | 1 MiB | 0.0116 | 0.0116 | 86.16 | 90.34 |
| `download` | 1 MiB | 0.0323 | 0.0074 | 30.92 | 32.43 |
| `upload` | 10 MiB | 0.0595 | 0.0592 | 168.00 | 176.16 |
| `download` | 10 MiB | 0.0472 | 0.0445 | 211.84 | 222.13 |
| `upload` | 50 MiB | 0.2059 | 0.2037 | **242.83** | **254.63** |
| `download` | 50 MiB | 0.2096 | 0.2066 | **238.58** | **250.17** |

Because these run over `127.0.0.1` loopback, they isolate Flask/Werkzeug + `.part` disk write overhead cleanly—real phone transfers are bounded by IEEE 802.11 airtime and phone flash speed rather than LocalDrop's Python server.

### Packaging, Installer, and CI (`build.py` + `localdrop.iss` + `build.yml`)

End users shouldn't have to install Python or create a `.venv`. `build.py` (329 lines) reads `APP_VERSION` from `main.py`, freezes the app with PyInstaller (`--windowed`, one-dir mode so startup skips `--onefile` temp extraction and keeps `{app}\LocalDrop.exe` fixed for firewall rules), resolves bundled templates and icons uniformly via `sys._MEIPASS` (`resource_path()`), and produces:

- **Frozen Windows app (`dist/LocalDrop/LocalDrop.exe`):** `5.9 MB` executable (`5,897,190` bytes) with bundled Qt5/Python runtime.
- **Windows portable archive (`release/LocalDrop-0.4.0-windows-portable.zip`):** `49.0 MB` (`49,007,360` bytes).
- **Windows Inno Setup installer (`release/LocalDrop-Setup-0.4.0.exe`):** `35.4 MB` (`35,396,209` bytes) using LZMA2 solid compression, Start Menu + optional desktop shortcuts, idempotent `netsh advfirewall` rules (including the Public-network hotspot task checked by default), and clean rule removal on uninstall.
- **Checksums (`release/SHA256SUMS.txt`):** Generated automatically by `write_checksums()`.
- **Linux & CI targets:** `build.py` stages Linux `.tar.gz` (`install.sh` + `.desktop` entry) and `.AppImage` builds, backed by a native `windows-latest` + `ubuntu-22.04` matrix in `.github/workflows/build.yml`.

## 7. Honest Verification Discipline & What I'd Do Differently

One of the biggest mindset shifts between student projects and professional engineering is **never claiming something works just because the script compiles**. Inside `docs/open-items.md` and `docs/09-testing.md`, I explicitly separated what is verified from what still needs testing:

- **Verified:** Physical Android (`Oppo A17`) offline hotspot transfers (`Send to PC` and `Receive from PC` with `pfp.jpg`), launching the rebuilt `dist/LocalDrop/LocalDrop.exe` (`0.0.0.0:5000`), 20 `unittest` cases passing in `0.813s`, and `scripts/benchmark.py` loopback throughput.
- **Still unverified (tracked in `open-items.md`):** End-to-end execution of the `LocalDrop-Setup-0.4.0.exe` wizard (shortcuts, UAC firewall creation, SmartScreen, uninstall), building/running the Linux `.tar.gz`/`.AppImage` targets on physical Linux hardware, live GitHub Actions / GitHub Releases execution, and multi-GB or simultaneous multi-phone stress tests.

Looking back across `v0.0` to `v0.4.0`, four engineering lessons stand out for my next project:

1. **Modularize before `main.py` hits 1,484 lines:** Separating Flask routes/security (`server.py`), file storage (`storage.py`), and PyQt5 widgets (`ui.py`) early keeps testability and readability high.
2. **Lock down Semantic Versioning on day one:** Moving from `v0.0`–`v0.2` to `1.2.1` (`v0.3`) and then `0.4.0` (`v0.4`) created avoidable version drift across `APP_VERSION`, `CHANGELOG.md`, and Git tags.
3. **Write integration & browser tests early:** Automated unit tests caught backend regressions fast, while client-side JavaScript in `templates/index.html` still deserves Playwright end-to-end coverage.
4. **Design the token transport cleanly:** Passing `TOKEN` in action URLs was fast to prototype; exchanging the initial QR bootstrap token for an `HttpOnly` cookie or `X-LocalDrop-Token` header is an immediate next upgrade.

LocalDrop didn't need to reinvent file sharing to transform how I build software. Taking a simple local-network idea all the way through OS diagnostics, threat modeling, automated testing, and installer engineering gave me a repeatable blueprint for every software system I ship next.

---

**Source & Engineering Docs:** Explore the codebase, architecture diagrams, security model, and full documentation at [github.com/itsthemaverick/LocalDrop](https://github.com/itsthemaverick/LocalDrop).
