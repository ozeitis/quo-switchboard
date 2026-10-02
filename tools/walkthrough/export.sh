#!/bin/bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$repo_root"
command -v ffmpeg >/dev/null || { echo 'FFmpeg is required.' >&2; exit 1; }
mkdir -p release/walkthrough docs/media
for format in wide square; do
  for file in "release/walkthrough/master-${format}.mp4" "release/walkthrough/switchboard-${format}.mp4"; do
    if [ -e "$file" ]; then
      echo "Existing export: $file. Move it aside before rendering again." >&2
      exit 1
    fi
  done
done

node --import tsx tools/walkthrough/capture.mjs
cp assets/icon.png release/walkthrough/captures/app-icon.png
xcrun swiftc -parse-as-library -swift-version 6 -target "$(uname -m)-apple-macos26.0" -O \
  tools/walkthrough/render.swift -o release/walkthrough/render

for format in wide square; do
  master="release/walkthrough/master-${format}.mp4"
  release/walkthrough/render release/walkthrough/captures "$master" "$format"
  destination="release/walkthrough/switchboard-${format}.mp4"
  ffmpeg -hide_banner -loglevel error -n -i "$master" -map 0:v:0 -map_metadata -1 \
    -c:v libx264 -preset slow -crf 19 -pix_fmt yuv420p -movflags +faststart \
    -color_primaries bt709 -color_trc bt709 -colorspace bt709 -an "$destination"
done

cp release/walkthrough/switchboard-wide.mp4 docs/media/switchboard-walkthrough.mp4
cp release/walkthrough/switchboard-square.mp4 docs/media/switchboard-social.mp4
ffmpeg -hide_banner -loglevel error -y -ss 1.5 -i release/walkthrough/switchboard-wide.mp4 \
  -frames:v 1 -q:v 2 -update 1 docs/media/walkthrough-poster.jpg
ffmpeg -hide_banner -loglevel error -y -ss 3 -t 6 -i release/walkthrough/switchboard-wide.mp4 \
  -filter_complex '[0:v]fps=10,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4' \
  -loop 0 docs/media/walkthrough-preview.gif
echo 'Exported the GitHub walkthrough, README preview, and square version for X.'
