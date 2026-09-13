// @ts-check
import { FFmpeg, FFFSType } from './vendor/ffmpeg/index.js';

/** @typedef {{codec_type?: string, codec_name?: string, width?: number, height?: number, duration?: string, avg_frame_rate?: string, nb_frames?: string, channels?: number, sample_rate?: string}} Stream */
/** @typedef {{streams?: Stream[], format?: {duration?: string}}} Probe */
/** @typedef {{width: number, height: number, duration: number, fps: number, frames: number | null, audio: Stream[]}} VideoInfo */

export const FILTER = '[0:v:0]split=3[left][middle][right];' +
  '[left]crop=1536:108:0:0[top];' +
  '[middle]crop=1536:108:1536:0[center];' +
  '[right]crop=1536:108:3072:0[bottom];' +
  '[top][center][bottom]vstack=inputs=3,pad=1920:1080:0:0:white,setsar=1[outv]';

/** @param {Probe} probe @returns {VideoInfo} */
export function videoInfo(probe) {
  const video = probe.streams?.find(s => s.codec_type === 'video');
  if (!video?.width || !video.height) throw new Error('Filen inneholder ikke et lesbart videospor.');
  const duration = Number(video.duration ?? probe.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Kunne ikke lese videoens varighet.');
  const [n, d] = (video.avg_frame_rate ?? '0/1').split('/').map(Number);
  const fps = n / d;
  if (!Number.isFinite(fps) || fps <= 0) throw new Error('Kunne ikke lese videoens bildefrekvens.');
  const frames = Number(video.nb_frames);
  return {width: video.width, height: video.height, duration, fps,
    frames: Number.isInteger(frames) && frames > 0 ? frames : null,
    audio: probe.streams?.filter(s => s.codec_type === 'audio') ?? []};
}

/** @param {number | null} seconds */
export function conversionArgs(seconds = null) {
  return ['-noautorotate', '-i', '/input/source.mp4',
    ...(seconds === null ? [] : ['-t', String(seconds)]),
    '-filter_complex', FILTER, '-map', '[outv]', '-map', '0:a?',
    '-c:v', 'libx264', '-crf', '18', '-preset', 'fast', '-pix_fmt', 'yuv420p',
    '-fps_mode:v', 'passthrough', '-c:a', 'copy', '-movflags', '+faststart', '/output.mp4'];
}

export class LedConverter {
  ffmpeg = new FFmpeg();
  stopped = false;
  /** @type {VideoInfo | null} */
  source = null;
  /** @type {string[]} */
  log = [];

  /** @param {(message: string) => void} onLog */
  constructor(onLog) {
    this.ffmpeg.on('log', ({message}) => {
      this.log.push(message);
      if (this.log.length > 100) this.log.shift();
      onLog(this.log.join('\n'));
    });
  }

  /** @param {File} file */
  async open(file) {
    if (file.size === 0) throw new Error('Filen er tom. Velg en MP4-video.');
    if (file.size >= 2_000_000_000) throw new Error('Filen er for stor for denne nettleserversjonen. Bruk FFmpeg-scriptet for filer på 2 GB eller mer.');
    await this.ffmpeg.load({
      coreURL: new URL('./vendor/core/ffmpeg-core.js', import.meta.url).href,
      wasmURL: new URL('./vendor/core/ffmpeg-core.wasm', import.meta.url).href,
    });
    await this.ffmpeg.createDir('/input');
    // WORKERFS reads the File on demand instead of copying the whole input into WASM memory.
    const mounted = await this.ffmpeg.mount(FFFSType.WORKERFS,
      {blobs: [{name: 'source.mp4', data: file}]}, '/input');
    if (!mounted) throw new Error('Nettlesermotoren kunne ikke åpne den lokale filen.');
    const info = await this.probe('/input/source.mp4');
    if (info.width !== 4608 || info.height !== 108) {
      throw new Error(`Videoen er ${info.width} × ${info.height}. Velg en LED-stripe på nøyaktig 4608 × 108 piksler.`);
    }
    this.source = info;
    return info;
  }

  /** @param {string} path */
  async probe(path) {
    // core 0.12.10 leaves ret=-1 on successful ffprobe runs. Empty the previous
    // report first, then require fresh, valid metadata as well as a non-error code.
    await this.ffmpeg.writeFile('/probe.json', '');
    const result = await this.ffmpeg.ffprobe(['-v', 'error', '-show_entries',
      'stream=codec_type,codec_name,width,height,duration,avg_frame_rate,nb_frames,channels,sample_rate:format=duration',
      '-of', 'json', path, '-o', '/probe.json']);
    if (result !== 0 && result !== -1) throw new Error('Kunne ikke lese videofilen. Kontroller at den er en gyldig MP4.');
    const data = await this.ffmpeg.readFile('/probe.json', 'utf8');
    if (typeof data !== 'string') throw new Error('Kunne ikke lese videoinformasjonen.');
    return videoInfo(JSON.parse(data));
  }

  /**
   * @param {number | null} seconds
   * @param {(percent: number, time: number) => void} onProgress
   * @param {() => void} onFinalizing
   */
  async convert(seconds, onProgress, onFinalizing) {
    const source = this.source;
    if (!source) throw new Error('Velg en video først.');
    const duration = seconds === null ? source.duration : Math.min(seconds, source.duration);
    /** @param {import('./vendor/ffmpeg/types.js').ProgressEvent} event */
    const progress = ({time}) => {
      onProgress(Math.max(0, Math.min(99, time / 1_000_000 / duration * 100)), time / 1_000_000);
    };
    this.ffmpeg.on('progress', progress);
    let code;
    try {
      code = await this.ffmpeg.exec(conversionArgs(seconds));
    } finally {
      this.ffmpeg.off('progress', progress);
    }
    if (code !== 0) {
      const hint = this.log.slice(-15).join(' ');
      if (/memory|alloc|out of bounds/i.test(hint)) throw new Error('Nettleseren gikk tom for minne. Lukk andre tunge faner og prøv igjen, eller bruk FFmpeg-scriptet.');
      throw new Error('Konverteringen stoppet. Prøv en femsekunders prøve. Detaljene ligger i konverteringsloggen.');
    }
    onFinalizing();
    const output = await this.probe('/output.mp4');
    if (output.width !== 1920 || output.height !== 1080 ||
        Math.abs(output.duration - duration) > Math.max(0.1, 2 / source.fps) ||
        output.audio.length !== source.audio.length ||
        (seconds === null && source.frames !== null && output.frames !== source.frames)) {
      throw new Error('Utfilen besto ikke kontrollen av format, varighet, bilder og lydspor. Prøv igjen.');
    }
    const data = await this.ffmpeg.readFile('/output.mp4');
    if (typeof data === 'string') throw new Error('Kunne ikke lese den ferdige videoen.');
    // Copy to a plain ArrayBuffer for Blob implementations that reject shared buffers.
    const blob = new Blob([new Uint8Array(data)], {type: 'video/mp4'});
    return {blob, info: output};
  }

  terminate() {
    this.stopped = true;
    this.ffmpeg.terminate();
  }
}
