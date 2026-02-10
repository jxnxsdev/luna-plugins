import fs from "fs";
import { fork, execSync } from "child_process";
import path from "path";
import os from "os";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type WorkerRequest = { cmd: "analyse"; filePath: string };
type WorkerResponse =
  | { type: "result"; entries: [number, number[]][] }
  | { type: "error"; error: string };

const IS_WORKER = process.argv.includes("--worker");

if (IS_WORKER) {
  process.on("message", async (msg: WorkerRequest) => {
    if (!msg || msg.cmd !== "analyse") return;

    try {
      const result = await doAnalyse(msg.filePath);
      const entries = Array.from(result.entries()) as [number, number[]][];
      process.send?.({ type: "result", entries } satisfies WorkerResponse);
      process.exit(0);
    } catch (err: any) {
      process.send?.({
        type: "error",
        error: err?.message ?? String(err),
      } satisfies WorkerResponse);
      process.exit(1);
    }
  });

  process.send?.({ type: "ready" });
}

async function doAnalyse(filePath: string): Promise<Map<number, number[]>> {
  await sleep(1000);

  const pcmPath = path.join(process.cwd(), "temp.pcm");

  // Convert audio → PCM Float32 mono 44100Hz
  execSync(
    `ffmpeg -y -i "${filePath}" -map 0:a:0 -ac 1 -ar 44100 -f f32le "${pcmPath}"`
  );

  const buffer = fs.readFileSync(pcmPath);
  fs.unlinkSync(pcmPath);
  fs.unlinkSync(filePath);

  const pcmLength = buffer.byteLength / 4;
  const pcm = new Float32Array(pcmLength);

  for (let i = 0; i < pcmLength; i++) {
    const v = buffer.readFloatLE(i * 4);
    pcm[i] = Number.isFinite(v) ? v : 0;
  }

  const sampleRate = 44100;

  const windowSize = 512 / 4; // ~23 ms
  const hopSize = windowSize;

  const bands = [
    [40, 85],
    [85, 184],
    [184, 395],
    [395, 848],
    [848, 1821],
    [1821, 3908],
    [3908, 8387],
    [8387, 20000],
  ];

  const freqPerBin = sampleRate / windowSize;
  const result = new Map<number, number[]>();

  const totalSamples = Math.max(pcm.length, windowSize);

  const frame = new Float32Array(windowSize);
  const frameStride = 0.5;

  let frameIndex = 0;

  const FFT: any = require("fft-js");

  for (let i = 0; i + windowSize <= totalSamples; i += hopSize) {
    if (frameIndex % frameStride !== 0) {
      frameIndex++;
      continue;
    }
    frameIndex++;

    for (let j = 0; j < windowSize; j++) {
      frame[j] = pcm[i + j] ?? 0;
    }

    // Hann window
    for (let j = 0; j < windowSize; j++) {
      frame[j] *= 0.5 * (1 - Math.cos((2 * Math.PI * j) / (windowSize - 1)));
    }

    let phasors: any[];
    try {
      const arr = Array.from(frame);
      phasors = FFT.fft(arr);
    } catch {
      const zeroBands = new Array(8).fill(0);
      const timeMs = Math.floor((i / sampleRate) * 1000);
      result.set(timeMs, zeroBands);
      continue;
    }

    const mags: number[] = FFT.util.fftMag(phasors);

    const bandValues = bands.map(([lo, hi]) => {
      const startBin = Math.floor(lo / freqPerBin);
      const endBin = Math.min(Math.floor(hi / freqPerBin), mags.length - 1);

      let sum = 0;
      for (let b = startBin; b <= endBin; b++) {
        const m = mags[b];
        sum += Number.isFinite(m) ? m : 0;
      }
      return sum;
    });

    const timeMs = Math.floor((i / sampleRate) * 1000);
    result.set(timeMs, bandValues);
  }

  return result;
}

export async function analyse(
  filePath: string
): Promise<Map<number, number[]>> {
  return new Promise((resolve, reject) => {
    const stubPath = path.join(
      os.tmpdir(),
      `audiovisualiser-worker-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.cjs`
    );

    const stub = `
'use strict';
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

// Sleep helper
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Inlined radix-2 FFT (complex), returns magnitudes for a real input frame.
function fftMagReal(frame) {
  const N = frame.length;
  // Ensure power-of-two
  if ((N & (N - 1)) !== 0) throw new Error('Frame length must be power-of-two');

  const real = new Float64Array(N);
  const imag = new Float64Array(N);
  for (let i = 0; i < N; i++) { real[i] = frame[i]; imag[i] = 0; }

  // Bit reverse
  let j = 0;
  for (let i = 0; i < N; i++) {
    if (i < j) {
      let tr = real[i]; real[i] = real[j]; real[j] = tr;
      let ti = imag[i]; imag[i] = imag[j]; imag[j] = ti;
    }
    let m = N >> 1;
    while (m >= 1 && j >= m) { j -= m; m >>= 1; }
    j += m;
  }

  // Cooley–Tukey
  for (let m = 2; m <= N; m <<= 1) {
    const halfM = m >> 1;
    const theta = -2 * Math.PI / m;
    for (let k = 0; k < halfM; k++) {
      const wr = Math.cos(theta * k);
      const wi = Math.sin(theta * k);
      for (let i = k; i < N; i += m) {
        const j2 = i + halfM;
        const tr = wr * real[j2] - wi * imag[j2];
        const ti = wr * imag[j2] + wi * real[j2];
        const ur = real[i], ui = imag[i];
        real[i] = ur + tr; imag[i] = ui + ti;
        real[j2] = ur - tr; imag[j2] = ui - ti;
      }
    }
  }

  const mags = new Float64Array(N);
  for (let i = 0; i < N; i++) mags[i] = Math.sqrt(real[i]*real[i] + imag[i]*imag[i]);
  return mags;
}

// Worker entry
process.on('message', async (msg) => {
  if (!msg || msg.cmd !== 'analyse') return;
  try {
    const result = await doAnalyse(msg.filePath);
    const entries = Array.from(result.entries());
    process.send?.({ type: 'result', entries });
    setImmediate(() => process.exit(0));
  } catch (err) {
    process.send?.({ type: 'error', error: err?.message ?? String(err) });
    setImmediate(() => process.exit(1));
  }
});

async function doAnalyse(filePath) {
  await sleep(1000);

  const pcmPath = path.join(process.cwd(), 'temp.pcm');

  // Convert audio → PCM Float32 mono 44100Hz
  execSync(\`ffmpeg -y -i "\${filePath}" -map 0:a:0 -ac 1 -ar 44100 -f f32le "\${pcmPath}"\`);

  const buffer = fs.readFileSync(pcmPath);
  try { fs.unlinkSync(pcmPath); fs.unlinkSync(filePath); } catch {}

  const pcmLength = buffer.byteLength / 4;
  const pcm = new Float32Array(pcmLength);

  for (let i = 0; i < pcmLength; i++) {
    const v = buffer.readFloatLE(i * 4);
    pcm[i] = Number.isFinite(v) ? v : 0;
  }

  const sampleRate = 44100;

  const windowSize = 512 / 4; // ~11.6 ms
  const hopSize = windowSize;

  const bands = [
    [40, 85],
    [85, 184],
    [184, 395],
    [395, 848],
    [848, 1821],
    [1821, 3908],
    [3908, 8387],
    [8387, 20000],
  ];

  const freqPerBin = sampleRate / windowSize;
  const result = new Map();

  const totalSamples = Math.max(pcm.length, windowSize);

  const frame = new Float32Array(windowSize);
  const frameStride = 1;
  let frameIndex = 0;

  for (let i = 0; i + windowSize <= totalSamples; i += hopSize) {
    if (frameIndex % frameStride !== 0) {
      frameIndex++;
      continue;
    }
    frameIndex++;

    for (let j = 0; j < windowSize; j++) {
      frame[j] = pcm[i + j] ?? 0;
    }

    // Hann window
    for (let j = 0; j < windowSize; j++) {
      frame[j] *= 0.5 * (1 - Math.cos((2 * Math.PI * j) / (windowSize - 1)));
    }

    let mags;
    try {
      mags = fftMagReal(Array.from(frame));
    } catch {
      const zeroBands = new Array(8).fill(0);
      const timeMs = Math.floor((i / sampleRate) * 1000);
      result.set(timeMs, zeroBands);
      continue;
    }

    const bandValues = bands.map(([lo, hi]) => {
      const startBin = Math.floor(lo / freqPerBin);
      const endBin = Math.min(Math.floor(hi / freqPerBin), mags.length - 1);

      let sum = 0;
      for (let b = startBin; b <= endBin; b++) {
        const m = mags[b];
        sum += Number.isFinite(m) ? m : 0;
      }
      return sum;
    });

    const timeMs = Math.floor((i / sampleRate) * 1000);
    result.set(timeMs, bandValues);
  }

  return result;
}

// Notify ready (optional)
process.send?.({ type: 'ready' });
`;
    fs.writeFileSync(stubPath, stub, "utf8");

    const child = fork(stubPath, [], {
      execArgv: [],
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });

    let cleaned = false;
    let handled = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      try {
        if (child.connected) child.disconnect();
      } catch {}
      try {
        fs.unlinkSync(stubPath);
      } catch {}
    };

    const finish = (value: Map<number, number[]>) => {
      if (handled) return;
      handled = true;
      cleanup();
      resolve(value);
    };
    const fail = (err: any) => {
      if (handled) return;
      handled = true;
      cleanup();
      reject(err);
    };

    child.on("message", (msg: WorkerResponse | any) => {
      if (msg?.type === "result") {
        const map = new Map<number, number[]>(msg.entries);
        finish(map);
      } else if (msg?.type === "error") {
        fail(new Error(msg.error || "Analysis failed"));
      }
    });

    child.once("error", (err) => fail(err));

    child.once("exit", (code) => {
      if (!handled) {
        if (code === 0) {
          fail(new Error("Analysis worker exited without sending a result"));
        } else {
          fail(new Error(`Analysis worker exited with code ${code}`));
        }
      }
    });

    child.send({ cmd: "analyse", filePath } satisfies WorkerRequest);
  });
}
