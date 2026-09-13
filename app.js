// @ts-check
import { LedConverter } from './conversion.js';

/** @template {HTMLElement} T @param {string} id @returns {T} */
function element(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element: ${id}`);
  return /** @type {T} */ (node);
}
/** @type {HTMLInputElement} */ const input = element('file-input');
/** @type {HTMLButtonElement} */ const convertButton = element('convert');
/** @type {HTMLButtonElement} */ const sampleButton = element('sample');
/** @type {HTMLButtonElement} */ const cancelButton = element('cancel');
/** @type {HTMLProgressElement} */ const progress = element('progress');
/** @type {HTMLAnchorElement} */ const download = element('download');
/** @type {HTMLVideoElement} */ const resultVideo = element('result-video');
const dropzone = element('dropzone');
const statusPanel = element('status-panel');
const errorPanel = element('error-panel');
const resultPanel = element('result-panel');
/** @type {File | null} */ let selectedFile = null;
/** @type {import('./conversion.js').VideoInfo | null} */ let selectedInfo = null;
/** @type {LedConverter | null} */ let engine = null;
let generation = 0;
let busy = false;
let outputURL = '';

/** @param {number} bytes */
function formatBytes(bytes) { return `${(bytes / 1_000_000).toLocaleString('nb-NO', {maximumFractionDigits: 1})} MB`; }
/** @param {number} seconds */
function formatTime(seconds) {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** @param {boolean} value */
function setBusy(value) {
  busy = value;
  input.disabled = value;
  dropzone.classList.toggle('disabled', value);
  convertButton.disabled = value || !selectedInfo;
  sampleButton.disabled = value || !selectedInfo;
  cancelButton.hidden = !value;
}

/** @param {string} heading @param {string} message */
function status(heading, message) {
  statusPanel.hidden = false;
  element('status-heading').textContent = heading;
  element('status-message').textContent = message;
  element('progress-number').textContent = '';
  progress.removeAttribute('value');
}

function clearResult() {
  resultVideo.pause();
  resultVideo.removeAttribute('src');
  resultVideo.load();
  download.removeAttribute('href');
  if (outputURL) URL.revokeObjectURL(outputURL);
  outputURL = '';
  resultPanel.hidden = true;
}

/** @param {unknown} error */
function showError(error) {
  errorPanel.textContent = error instanceof Error ? error.message :
    'Videomotoren stoppet. Kontroller at filene i appmappen er tilgjengelige, og at nettleseren har ledig minne. Prøv deretter igjen.';
  errorPanel.hidden = false;
  statusPanel.hidden = true;
}

/** @param {import('./conversion.js').VideoInfo} info @param {File} file */
function showFile(info, file) {
  element('file-name').textContent = file.name;
  element('source-size').textContent = `${info.width} × ${info.height}`;
  element('source-duration').textContent = formatTime(info.duration);
  element('source-fps').textContent = `${info.fps.toLocaleString('nb-NO', {maximumFractionDigits: 3})} bilder/s`;
  element('source-bytes').textContent = formatBytes(file.size);
  element('source-audio').textContent = info.audio.length
    ? `Lyd beholdes · ${info.audio.map(s => `${s.codec_name?.toUpperCase() ?? 'lyd'}${s.channels ? `, ${s.channels} kanaler` : ''}`).join(' · ')}`
    : 'Kilden har ikke lydspor. Utfilen blir uten lyd.';
  element('file-details').hidden = false;
  dropzone.closest('section')?.classList.add('has-file');
}

/** @param {number} ticket */
function createEngine(ticket) {
  const instance = new LedConverter(log => {
    if (ticket === generation) {
      element('log').textContent = log;
      element('log-panel').hidden = false;
    }
  });
  engine = instance;
  return instance;
}

/** @param {File} file */
async function selectFile(file) {
  if (busy) return;
  const ticket = ++generation;
  engine?.terminate();
  engine = null;
  selectedFile = null;
  selectedInfo = null;
  clearResult();
  errorPanel.hidden = true;
  element('file-details').hidden = true;
  element('log-panel').hidden = true;
  element('log').textContent = '';
  dropzone.closest('section')?.classList.remove('has-file');
  setBusy(true);
  status('Leser videoen…', 'Laster videomotoren og sjekker oppløsning, varighet og lyd.');
  const instance = createEngine(ticket);
  try {
    const info = await instance.open(file);
    if (ticket !== generation) return;
    selectedFile = file;
    selectedInfo = info;
    showFile(info, file);
    statusPanel.hidden = true;
  } catch (error) {
    if (ticket !== generation) return;
    instance.terminate();
    engine = null;
    showError(error);
  } finally {
    if (ticket === generation) setBusy(false);
  }
}

/** @param {number | null} seconds */
async function convert(seconds) {
  if (busy || !selectedFile || !selectedInfo) return;
  const ticket = ++generation;
  const file = selectedFile;
  const duration = seconds === null ? selectedInfo.duration : Math.min(seconds, selectedInfo.duration);
  errorPanel.hidden = true;
  clearResult();
  setBusy(true);
  status('Forbereder konverteringen…', 'Videoen behandles lokalt. Hold fanen åpen.');
  // Each conversion owns its worker so cancellation and retries cannot share stale state.
  engine?.terminate();
  const instance = createEngine(ticket);
  try {
    await instance.open(file);
    if (ticket !== generation) return;
    status(seconds === null ? 'Konverterer videoen…' : 'Lager en femsekunders prøve…', 'Deler, stabler og legger på hvit bakgrunn.');
    progress.value = 0;
    const result = await instance.convert(seconds, (percent, time) => {
      if (ticket !== generation) return;
      progress.value = Math.max(progress.value, percent);
      element('progress-number').textContent = `${Math.floor(progress.value)} %`;
      element('status-message').textContent = `${formatTime(Math.min(time, duration))} av ${formatTime(duration)} behandlet`;
    }, () => {
      if (ticket === generation) status('Gjør filen klar…', 'Kontrollerer format, varighet og lydspor.');
    });
    if (ticket !== generation) return;
    outputURL = URL.createObjectURL(result.blob);
    const stem = file.name.replace(/\.[^.]+$/, '');
    download.href = outputURL;
    download.download = `${stem}${seconds === null ? '' : '_prove_5s'}_stablet_1920x1080.mp4`;
    resultVideo.src = outputURL;
    element('result-heading').textContent = seconds === null ? 'Klar til skjermen.' : 'Prøven er klar.';
    element('result-info').textContent = `1920 × 1080 · ${formatTime(result.info.duration)} · ${formatBytes(result.blob.size)} · ${result.info.audio.length ? 'Lyd beholdt' : 'Uten lyd'}`;
    statusPanel.hidden = true;
    resultPanel.hidden = false;
  } catch (error) {
    if (ticket === generation) showError(error);
  } finally {
    instance.terminate();
    if (ticket === generation) {
      engine = null;
      setBusy(false);
    }
  }
}

input.addEventListener('change', () => {
  const file = input.files?.[0];
  input.value = '';
  if (file) void selectFile(file);
});
dropzone.addEventListener('dragover', event => { event.preventDefault(); if (!busy) dropzone.classList.add('dragover'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', event => {
  event.preventDefault();
  dropzone.classList.remove('dragover');
  if (busy) return;
  if (event.dataTransfer?.files.length !== 1) {
    errorPanel.textContent = 'Velg én video om gangen.';
    errorPanel.hidden = false;
    return;
  }
  void selectFile(event.dataTransfer.files[0]);
});
// Prevent an accidental drop outside the target from navigating away from the app.
window.addEventListener('dragover', event => event.preventDefault());
window.addEventListener('drop', event => event.preventDefault());
convertButton.addEventListener('click', () => void convert(null));
sampleButton.addEventListener('click', () => void convert(5));
cancelButton.addEventListener('click', () => {
  ++generation;
  engine?.terminate();
  engine = null;
  statusPanel.hidden = true;
  setBusy(false);
  errorPanel.textContent = 'Avbrutt. Du kan starte igjen eller velge en annen video.';
  errorPanel.hidden = false;
});
window.addEventListener('beforeunload', event => {
  if (busy) { event.preventDefault(); event.returnValue = ''; }
});
window.addEventListener('pagehide', () => {
  engine?.terminate();
  if (outputURL) URL.revokeObjectURL(outputURL);
});

if (location.protocol === 'file:') {
  input.disabled = true;
  showError(new Error('Åpne appen via en webadresse eller en lokal webserver. Nettleseren tillater ikke videomotoren når HTML-filen åpnes direkte fra disken.'));
} else if (typeof WebAssembly === 'undefined' || typeof Worker === 'undefined') {
  input.disabled = true;
  showError(new Error('Denne nettleseren støtter ikke WebAssembly og web workers. Åpne appen i en oppdatert nettleser.'));
}
