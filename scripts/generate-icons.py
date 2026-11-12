#!/usr/bin/env python3
"""Generate the MCode app icon set from a drawn source.

Draws a black rounded tile with a white sigma (Σ) mark at 1024x1024,
then writes every icon file Tauri bundles need into src-tauri/icons/.
Run from the repo root:

    python3 scripts/generate-icons.py

Requires Pillow. The generated assets/icon.png is the canonical source;
pass it to `cargo tauri icon assets/icon.png` instead if the CLI is around.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
ICONS = ROOT / "src-tauri" / "icons"

SIZE = 1024
SS = 4  # supersample factor for clean edges
INK = (10, 10, 12)
PAPER = (255, 255, 255)
SIGMA_FONTS = (
    "/usr/share/fonts/truetype/noto/NotoSans-SemiBold.ttf",
    "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
)


def draw_source() -> Image.Image:
    px = SIZE * SS
    tile = (64 * SS, 64 * SS, 960 * SS, 960 * SS)
    radius = 200 * SS

    img = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle(tile, radius=radius, fill=INK + (255,))

    font = next((path for path in SIGMA_FONTS if Path(path).exists()), None)
    if font:
        sigma = ImageFont.truetype(font, 660 * SS)
        draw.text((px / 2, px / 2), "Σ", font=sigma, fill=PAPER + (255,), anchor="mm")
    else:
        # Geometric fallback: top and bottom bars joined by a middle vertex.
        stroke = 118 * SS
        points = [
            (724 * SS, 338 * SS),
            (302 * SS, 338 * SS),
            (566 * SS, 512 * SS),
            (302 * SS, 686 * SS),
            (724 * SS, 686 * SS),
        ]
        draw.line(points, fill=PAPER + (255,), width=stroke, joint="curve")
        cap = stroke / 2
        for x, y in (points[0], points[-1]):
            draw.ellipse((x - cap, y - cap, x + cap, y + cap), fill=PAPER + (255,))

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
