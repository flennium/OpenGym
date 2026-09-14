import { existsSync } from "node:fs";
import { join } from "node:path";
import * as ort from "onnxruntime-node";
import sharp from "sharp";

const INPUT = 640;
const DETECTION_THRESHOLD = 0.65;
const MATCH_THRESHOLD = 0.45;

type Detection = { box: [number, number, number, number]; score: number };

export class FaceRecognitionService {
  private detector?: ort.InferenceSession;
  private recognizer?: ort.InferenceSession;

  constructor(private readonly modelDirectory: string) {}

  status() {
    const detector = join(this.modelDirectory, "det_500m.onnx");
    const recognizer = join(this.modelDirectory, "w600k_mbf.onnx");
    return {
      ready: existsSync(detector) && existsSync(recognizer),
      model: "InsightFace buffalo_sc",
      version: "0.7",
    };
  }

  private async initialize() {
    if (this.detector && this.recognizer) return;
    if (!this.status().ready)
      throw new Error("Face recognition models are not installed");
    this.detector = await ort.InferenceSession.create(
      join(this.modelDirectory, "det_500m.onnx"),
      { executionProviders: ["cpu"] },
    );
    this.recognizer = await ort.InferenceSession.create(
      join(this.modelDirectory, "w600k_mbf.onnx"),
      { executionProviders: ["cpu"] },
    );
  }

  async embedding(dataUrl: string) {
    await this.initialize();
    const match =
      /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match) throw new Error("Camera capture is not a supported image");
    const source = Buffer.from(match[1], "base64");
    if (source.length > 4 * 1024 * 1024)
      throw new Error("Camera capture is too large");
    const image = sharp(source).rotate();
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height)
      throw new Error("Camera capture could not be read");
    const raw = await image
      .clone()
      .resize(INPUT, INPUT, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer();
    const input = new Float32Array(3 * INPUT * INPUT);
    const plane = INPUT * INPUT;
    for (let pixel = 0; pixel < plane; pixel++) {
      input[pixel] = (raw[pixel * 3] - 127.5) / 128;
      input[plane + pixel] = (raw[pixel * 3 + 1] - 127.5) / 128;
      input[plane * 2 + pixel] = (raw[pixel * 3 + 2] - 127.5) / 128;
    }
    const output = await this.detector!.run({
      "input.1": new ort.Tensor("float32", input, [1, 3, INPUT, INPUT]),
    });
    const detections = this.decode(output);
    if (!detections.length)
      throw new Error(
        "No face found. Face the camera and improve the lighting.",
      );
    if (detections.length > 1)
      throw new Error(
        "More than one face is visible. Only the member should be in frame.",
      );
    const detection = detections[0];
    const [x1, y1, x2, y2] = detection.box;
    const width = x2 - x1;
    const height = y2 - y1;
    if (Math.min(width, height) < 120)
      throw new Error("Move closer to the camera.");
    const scaleX = metadata.width / INPUT;
    const scaleY = metadata.height / INPUT;
    const padding = Math.max(width, height) * 0.18;
    const left = Math.max(0, Math.floor((x1 - padding) * scaleX));
    const top = Math.max(0, Math.floor((y1 - padding) * scaleY));
    const cropWidth = Math.min(
      metadata.width - left,
      Math.ceil((width + padding * 2) * scaleX),
    );
    const cropHeight = Math.min(
      metadata.height - top,
      Math.ceil((height + padding * 2) * scaleY),
    );
    const face = await image
      .clone()
      .extract({ left, top, width: cropWidth, height: cropHeight })
      .resize(112, 112, { fit: "cover" })
      .removeAlpha()
      .raw()
      .toBuffer();
    const faceInput = new Float32Array(3 * 112 * 112);
    const facePlane = 112 * 112;
    for (let pixel = 0; pixel < facePlane; pixel++) {
      faceInput[pixel] = (face[pixel * 3] - 127.5) / 127.5;
      faceInput[facePlane + pixel] = (face[pixel * 3 + 1] - 127.5) / 127.5;
      faceInput[facePlane * 2 + pixel] = (face[pixel * 3 + 2] - 127.5) / 127.5;
    }
    const recognized = await this.recognizer!.run({
      "input.1": new ort.Tensor("float32", faceInput, [1, 3, 112, 112]),
    });
    const values = Array.from(
      recognized[this.recognizer!.outputNames[0]].data as Float32Array,
    );
    const norm = Math.sqrt(
      values.reduce((sum, value) => sum + value * value, 0),
    );
    return {
      embedding: values.map((value) => value / norm),
      quality: detection.score,
    };
  }

  compare(a: number[], b: number[]) {
    if (a.length !== b.length) return -1;
    return a.reduce((score, value, index) => score + value * b[index], 0);
  }

  match(
    probe: number[],
    templates: Array<{ memberId: number; embedding: number[] }>,
  ) {
    const ranked = templates
      .map((template) => ({
        ...template,
        score: this.compare(probe, template.embedding),
      }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (
      !best ||
      best.score < MATCH_THRESHOLD ||
      (ranked[1] && best.score - ranked[1].score < 0.05)
    )
      return null;
    return best;
  }

  private decode(output: Record<string, ort.OnnxValue>) {
    const names = this.detector!.outputNames;
    const results: Detection[] = [];
    for (let level = 0; level < 3; level++) {
      const stride = [8, 16, 32][level];
      const scores = output[names[level]].data as Float32Array;
      const boxes = output[names[level + 3]].data as Float32Array;
      const columns = INPUT / stride;
      for (let index = 0; index < scores.length; index++) {
        if (scores[index] < DETECTION_THRESHOLD) continue;
        const anchor = Math.floor(index / 2);
        const x = (anchor % columns) * stride;
        const y = Math.floor(anchor / columns) * stride;
        results.push({
          score: scores[index],
          box: [
            x - boxes[index * 4] * stride,
            y - boxes[index * 4 + 1] * stride,
            x + boxes[index * 4 + 2] * stride,
            y + boxes[index * 4 + 3] * stride,
          ],
        });
      }
    }
    return results
      .sort((a, b) => b.score - a.score)
      .filter((candidate, index, all) =>
        all
          .slice(0, index)
          .every((kept) => this.iou(candidate.box, kept.box) < 0.4),
      );
  }

  private iou(a: Detection["box"], b: Detection["box"]) {
    const intersection =
      Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) *
      Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
    const areaA = Math.max(0, a[2] - a[0]) * Math.max(0, a[3] - a[1]);
    const areaB = Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
    return intersection / (areaA + areaB - intersection || 1);
  }
}
