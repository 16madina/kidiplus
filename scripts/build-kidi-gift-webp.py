"""Build the transparent, iOS-safe KD+ gift animation from Blender PNG frames.

Usage:
  python scripts/build-kidi-gift-webp.py SOURCE_FRAMES_DIR OUTPUT.webp

The Blender render is 30 fps at 1080x1920. For an in-app overlay, 15 fps at
540x960 is visually sufficient and keeps the animated WebP small enough to
preload on mobile while retaining its alpha channel.
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: build-kidi-gift-webp.py SOURCE_FRAMES_DIR OUTPUT.webp")
        return 2

    source_dir = Path(sys.argv[1])
    output = Path(sys.argv[2])
    source_frames = sorted(source_dir.glob("frame_*.png"))
    if not source_frames:
        raise SystemExit(f"no frame_*.png files found in {source_dir}")

    frames: list[Image.Image] = []
    for path in source_frames[::2]:
        with Image.open(path) as image:
            rgba = image.convert("RGBA")
            frames.append(rgba.resize((540, 960), Image.Resampling.LANCZOS))

    output.parent.mkdir(parents=True, exist_ok=True)
    first, *rest = frames
    first.save(
        output,
        format="WEBP",
        save_all=True,
        append_images=rest,
        duration=67,
        loop=0,
        quality=82,
        method=4,
        minimize_size=True,
        allow_mixed=True,
        exact=True,
    )
    print(f"wrote {output} ({len(frames)} frames, {output.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
