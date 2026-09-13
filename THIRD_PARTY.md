# FFmpeg-avhengigheter

Denne mappen inkluderer uendrede nettleserfiler fra følgende npm-pakker:

| Pakke | Versjon | Innhold |
| --- | --- | --- |
| @ffmpeg/ffmpeg | 0.12.15 | JavaScript-API og web worker |
| @ffmpeg/core | 0.12.10 | Enkelttrådet FFmpeg-motor, JavaScript og WebAssembly |

JavaScript-API-et er MIT-lisensiert; lisensen ligger i `vendor/ffmpeg/LICENSE`. GPL v2-teksten ligger i `vendor/core/COPYING.GPLv2`.

FFmpeg-motoren følger FFmpeg og de inkluderte bibliotekenes lisenser. Denne distribusjonen inkluderer GPL-komponenter, blant annet x264. Se prosjektets [lisensinformasjon](https://ffmpegwasm.netlify.app/docs/faq/#what-is-the-license-of-ffmpegwasm), [FFmpeg-lisenser](https://ffmpeg.org/legal.html) og [byggeskript og kildehenvisninger](https://github.com/ffmpegwasm/ffmpeg.wasm/tree/main/build).

Oppstrøms kode: <https://github.com/ffmpegwasm/ffmpeg.wasm>.
Versjonslåste pakker: <https://www.npmjs.com/package/@ffmpeg/ffmpeg/v/0.12.15> og <https://www.npmjs.com/package/@ffmpeg/core/v/0.12.10>.

Pakkeversjonene er også registrert i hver `vendor/*/package.json`.
