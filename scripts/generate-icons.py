#!/usr/bin/env python3
"""Generate the MCode app icon set from a drawn source.

Draws the accent tile + white "M" monogram (same mark as the header logo)
at 1024x1024, then writes every icon file Tauri bundles need into
src-tauri/icons/. Run from the repo root:

    python3 scripts/generate-icons.py

Requires Pillow. The generated assets/icon.png is the canonical source;
pass it to `cargo tauri icon assets/icon.png` instead if the CLI is around.
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
ICONS = ROOT / "src-tauri" / "icons"

SIZE = 1024
SS = 4  # supersample factor for clean edges
ACCENT_TOP = (61, 123, 255)
ACCENT_BOTTOM = (30, 88, 216)


def draw_source() -> Image.Image:
    px = SIZE * SS
    tile = (64 * SS, 64 * SS, 960 * SS, 960 * SS)
    radius = 200 * SS

    # Vertical accent gradient clipped to the rounded tile.
    gradient = Image.new("RGB", (px, px))
    grad_draw = ImageDraw.Draw(gradient)
    for y in range(px):
        t = y / (px - 1)
        color = tuple(round(ACCENT_TOP[i] + (ACCENT_BOTTOM[i] - ACCENT_TOP[i]) * t) for i in range(3))
        grad_draw.line([(0, y), (px, y)], fill=color)

    mask = Image.new("L", (px, px), 0)
    ImageDraw.Draw(mask).rounded_rectangle(tile, radius=radius, fill=255)

    img = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    img.paste(gradient, (0, 0), mask)

    # Bold monogram M: two verticals joined by a rounded V.
    draw = ImageDraw.Draw(img)
    stroke = 118 * SS
    points = [
        (300 * SS, 710 * SS),
        (300 * SS, 342 * SS),
        (512 * SS, 566 * SS),
        (724 * SS, 342 * SS),
        (724 * SS, 710 * SS),
    ]
    draw.line(points, fill=(255, 255, 255, 255), width=stroke, joint="curve")
    cap = stroke / 2
    for x, y in (points[0], points[-1]):
        draw.ellipse((x - cap, y - cap, x + cap, y + cap), fill=(255, 255, 255, 255))

    return img.resize((SIZE, SIZE), Image.LANCZOS)


def save_png(img: Image.Image, name: str, size: int) -> None:
    img.resize((size, size), Image.LANCZOS).save(ICONS / name, optimize=True)


def save_icns(img: Image.Image) -> None:
    # Modern ICNS is a container of PNG payloads.
    entries = [
        (b"icp4", 16),
        (b"icp5", 32),
        (b"icp6", 64),
        (b"ic07", 128),
        (b"ic08", 256),
        (b"ic09", 512),
        (b"ic10", 1024),
        (b"ic11", 32),
        (b"ic12", 64),
        (b"ic13", 256),
        (b"ic14", 512),
    ]
    chunks = []
    for kind, size in entries:
        from io import BytesIO

        buf = BytesIO()
        img.resize((size, size), Image.LANCZOS).save(buf, format="PNG", optimize=True)
        data = buf.getvalue()
        chunks.append(kind + (len(data) + 8).to_bytes(4, "big") + data)
    body = b"".join(chunks)
    (ICONS / "icon.icns").write_bytes(b"icns" + (len(body) + 8).to_bytes(4, "big") + body)


def main() -> None:
    ASSETS.mkdir(exist_ok=True)
    ICONS.mkdir(parents=True, exist_ok=True)
    img = draw_source()
    img.save(ASSETS / "icon.png", optimize=True)

    save_png(img, "32x32.png", 32)
    save_png(img, "128x128.png", 128)
    save_png(img, "128x128@2x.png", 256)
    save_png(img, "icon.png", 512)

    # Windows Store / taskbar logos (tauri icon's layout).
    for name, size in {
        "Square30x30Logo.png": 30,
        "Square44x44Logo.png": 44,
        "Square71x71Logo.png": 71,
        "Square89x89Logo.png": 89,
        "Square107x107Logo.png": 107,
        "Square142x142Logo.png": 142,
        "Square150x150Logo.png": 150,
        "Square284x284Logo.png": 284,
        "Square310x310Logo.png": 310,
        "StoreLogo.png": 50,
    }.items():
        save_png(img, name, size)

    img.save(
        ICONS / "icon.ico",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    save_icns(img)
    print(f"wrote {ASSETS / 'icon.png'} and {len(list(ICONS.iterdir()))} files in {ICONS}")


if __name__ == "__main__":
    main()
