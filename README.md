# LED-verktøy

[Åpne webappen](https://tomashm.github.io/led-web/) · [GitHub-repo](https://github.com/tomashm/led-web)

Statisk HTML, CSS og JavaScript. Ingen backend, opplasting, database, Node-avhengighet eller byggesteg. Videoen behandles i nettleseren med FFmpeg.wasm. Motoren følger med i `vendor/`; ingen CDN-kall er nødvendige ved bruk.

## Kjør lokalt

Fra denne mappen:

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

Åpne <http://127.0.0.1:8080>. Python er bare en statisk filserver og behandler ingen video. Du kan bruke en hvilken som helst annen statisk server. Direkte åpning av `index.html` via `file://` støtter ikke modulene og web workers.

## Publiser

GitHub Actions publiserer den statiske appen til GitHub Pages ved hver push til `main`. Workflowen ligger i `.github/workflows/pages.yml`. GitHub Pages bruker «GitHub Actions» som publiseringskilde. Ingen bygging eller pakkeinstallasjon inngår i publiseringen.

Legg hele denne mappen på en statisk webserver, inkludert `vendor/`. Bruk HTTPS. Filene fungerer også i en undermappe. Serveren må levere `.js` som JavaScript og `.wasm` som `application/wasm`.

Enkelttrådet FFmpeg krever ikke COOP/COEP-headere eller SharedArrayBuffer. `vendor/core/ffmpeg-core.wasm` er omtrent 32 MB; sjekk at verten tillater filer av denne størrelsen. Ingen tjeneste for videokonvertering eller appserver er nødvendig.

## Konvertering

- Inndata: MP4 med et første videospor på nøyaktig 4608 × 108.
- Venstre, midtre og høyre tredel blir henholdsvis øverste, midterste og nederste rad.
- Tre rader på 1536 × 108 ligger ved (0,0), (0,108) og (0,216) i 1920 × 1080. Resten er hvit.
- H.264, CRF 18, preset fast, yuv420p. Bildefrekvens og eksisterende lydspor beholdes.
- Velg hele filmen eller en prøve av de første fem sekundene.
- Utfilens oppløsning, varighet, antall bilder ved full konvertering (når kjent) og antall lydspor kontrolleres før nedlasting.
- Avbryt stopper web workeren. Arbeidsminnet frigjøres etter konvertering, feil og avbrudd. Nedlastingsfilen beholdes til du velger ny fil, starter en ny konvertering eller lukker fanen.

WORKERFS leser kildefilen ved behov i stedet for å kopiere hele innfilen inn i motorens minne. Utfilen og kodeken bruker fortsatt minne. Filer på minst 2 milliarder byte avvises; også mindre filer kan bruke mer minne enn nettleseren tillater. Nettleserkoding er vesentlig tregere enn vanlig FFmpeg. Test en kort prøve på den aktuelle maskinen først.

## Filer

- `index.html`: grensesnitt.
- `styles.css`: responsiv utforming.
- `app.js`: filvalg, fremdrift, avbryt, forhåndsvisning og nedlasting.
- `conversion.js`: FFmpeg-kjøring og validering.
- `vendor/`: versjonslåst FFmpeg.wasm og motor.
- `jsconfig.json`: valgfri typesjekk med `tsc -p jsconfig.json`; ingen kompilering kreves for kjøring.

Se [THIRD_PARTY.md](THIRD_PARTY.md) for versjoner og kildekode.

## Verifisering

JavaScript-koden er typesjekket. Den inkluderte WebAssembly-motoren er kjørt på korte utdrag med og uten lyd i en Node-testsele. Utfilene er dekodet med vanlig FFmpeg; radrekkefølge, hvit bakgrunn, videoformat og identiske kopierte lyddata er kontrollert. Serverens JavaScript- og WASM-filer leveres med riktige MIME-typer.

Brukerflyten og fullengdekonvertering i en nettleser er ikke testet automatisk. Prøveknappen lar deg kontrollere dette på maskinen og nettleseren som skal brukes.
