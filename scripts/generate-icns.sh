#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "$script_dir/.." && pwd)"
source_png="$project_root/resources/icon.png"
iconset_dir="$project_root/resources/icon.iconset"
output_icns="$project_root/resources/icon.icns"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "macOS is required to generate an ICNS file." >&2
  exit 1
fi
if [[ ! -s "$source_png" ]]; then
  echo "Missing source icon: $source_png" >&2
  exit 1
fi

rm -rf "$iconset_dir"
mkdir -p "$iconset_dir"

for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$source_png" --out "$iconset_dir/icon_${size}x${size}.png" >/dev/null
  double_size=$((size * 2))
  sips -z "$double_size" "$double_size" "$source_png" --out "$iconset_dir/icon_${size}x${size}@2x.png" >/dev/null
done

iconutil -c icns "$iconset_dir" -o "$output_icns"
rm -rf "$iconset_dir"
test -s "$output_icns"
echo "Generated $output_icns"
