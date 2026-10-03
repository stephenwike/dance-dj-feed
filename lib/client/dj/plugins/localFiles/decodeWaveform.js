/**
 * Decode an audio file into timeline waveform peaks (browser only).
 *
 * Decoding resamples to a low rate — plenty for a picture of loudness over
 * time, and a quarter of the memory of full-rate audio.
 */
import { computePeaks } from './waveform';

const DECODE_SAMPLE_RATE = 11025;

let decoder = null;

/** @returns {{ peaks: number[], durationSec: number }} */
export async function decodeWaveform(file) {
  decoder ??= new OfflineAudioContext(1, 1, DECODE_SAMPLE_RATE);
  const buffer = await decoder.decodeAudioData(await file.arrayBuffer());
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  return { peaks: computePeaks(channels), durationSec: buffer.duration };
}
