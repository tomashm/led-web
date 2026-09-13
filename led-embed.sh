#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Bruk: ./led-embed.sh INPUT [OUTPUT.mp4]

Brekker en 4608x108-video i tre like deler fra venstre mot høyre.
Stabler delene ovenfra og ned til 1536x324, og legger dem ved (0,0)
på en hvit 1920x1080-flate. Ingen skalering eller mellomvideo.

Standard utfil: <inputnavn>_stablet_1920x1080.mp4
Video: H.264, CRF 18, preset fast, yuv420p. Bildefrekvensen beholdes.
Eventuelle lydspor kopieres uendret og må være kompatible med MP4.
Eksisterende filer overskrives ikke.
EOF
}

if [[ ${1:-} == -h || ${1:-} == --help ]]; then
  usage
  exit 0
fi
if (( $# < 1 || $# > 2 )); then
  usage >&2
  exit 1
fi

for tool in ffmpeg ffprobe; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    printf 'Mangler %s i PATH. Installer FFmpeg først.\n' "$tool" >&2
    exit 1
  fi
done

input=$1
output=${2:-${input%.*}_stablet_1920x1080.mp4}
# Absolutte stier håndterer også filnavn som begynner med bindestrek.
[[ $input == /* ]] || input="$PWD/$input"
[[ $output == /* ]] || output="$PWD/$output"

if [[ ! -f $input ]]; then
  printf 'Finner ikke inputfilen: %s\n' "$input" >&2
  exit 1
fi
if [[ $output != *.[mM][pP]4 ]]; then
  printf 'Utfilen må ha filendelsen .mp4: %s\n' "$output" >&2
  exit 1
fi
if [[ -e $output || -L $output ]]; then
  printf 'Utfilen finnes allerede: %s\n' "$output" >&2
  exit 1
fi

dimensions=$(ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height -of csv=s=x:p=0 "$input")
if [[ $dimensions != 4608x108 ]]; then
  printf 'Forventet 4608x108, fikk %s: %s\n' "${dimensions:-ingen video}" "$input" >&2
  exit 1
fi

filter='[0:v:0]split=3[left][middle][right];
[left]crop=1536:108:0:0[top];
[middle]crop=1536:108:1536:0[center];
[right]crop=1536:108:3072:0[bottom];
[top][center][bottom]vstack=inputs=3,pad=1920:1080:0:0:white,setsar=1[outv]'

command=(ffmpeg -hide_banner -nostdin -n -noautorotate -i "$input"
  -filter_complex "$filter" -map '[outv]' -map '0:a?'
  -c:v libx264 -crf 18 -preset fast -pix_fmt yuv420p
  -fps_mode:v passthrough -c:a copy -movflags +faststart "$output")

printf 'Kjører:'
printf ' %q' "${command[@]}"
printf '\n'
exec "${command[@]}"
