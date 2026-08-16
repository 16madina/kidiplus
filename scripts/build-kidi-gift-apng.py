"""Build the transparent, iOS-safe KD+ APNG from Blender PNG frames.

Usage:
  python scripts/build-kidi-gift-apng.py SOURCE_FRAMES_DIR OUTPUT.png

Requires ffmpeg on PATH. The mobile overlay uses 12 fps at 288x512: enough
detail for its 210 px display size without carrying the full Blender render.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: build-kidi-gift-apng.py SOURCE_FRAMES_DIR OUTPUT.png")
        return 2

    source_dir = Path(sys.argv[1])
    output = Path(sys.argv[2])
    first_frame = source_dir / "frame_0001.png"
    ffmpeg = shutil.which("ffmpeg")

    if not first_frame.is_file():
        raise SystemExit(f"missing Blender frames in {source_dir}")
    if not ffmpeg:
        raise SystemExit("ffmpeg is required on PATH")

    output.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            ffmpeg,
            "-y",
            "-framerate",
            "30",
            "-i",
            str(source_dir / "frame_%04d.png"),
            "-vf",
            "fps=12,scale=288:512:flags=lanczos",
            "-plays",
            "0",
            "-f",
            "apng",
            str(output),
        ],
        check=True,
    )
    print(f"wrote {output} ({output.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
