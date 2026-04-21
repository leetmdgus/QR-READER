// 1) 프로젝트 생성
// npm create vite@latest qr-link-button-app -- --template react-ts
// cd qr-link-button-app
// npm install
// npm install jsqr lucide-react
// npm run dev

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import jsQR from "jsqr";
import {
  AlertCircle,
  ExternalLink,
  Image as ImageIcon,
  Link as LinkIcon,
  QrCode,
  Upload,
} from "lucide-react";

type ScanState = {
  previewUrl: string;
  fileName: string;
  decodedText: string;
  isScanning: boolean;
  error: string;
};

function isLikelyUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function normalizeUrl(value: string): string {
  if (!value) return "";
  if (isLikelyUrl(value)) return value;

  try {
    return new URL(`https://${value}`).toString();
  } catch {
    return "";
  }
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
    image.src = src;
  });
}

function toGrayscale(data: Uint8ClampedArray): Uint8ClampedArray {
  const output = new Uint8ClampedArray(data.length);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

    output[i] = gray;
    output[i + 1] = gray;
    output[i + 2] = gray;
    output[i + 3] = a;
  }

  return output;
}

function applyContrast(data: Uint8ClampedArray, contrast: number): Uint8ClampedArray {
  const output = new Uint8ClampedArray(data.length);
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

  for (let i = 0; i < data.length; i += 4) {
    const value = data[i];
    const adjusted = Math.max(0, Math.min(255, factor * (value - 128) + 128));

    output[i] = adjusted;
    output[i + 1] = adjusted;
    output[i + 2] = adjusted;
    output[i + 3] = data[i + 3];
  }

  return output;
}

function applyBinaryThreshold(data: Uint8ClampedArray, threshold: number): Uint8ClampedArray {
  const output = new Uint8ClampedArray(data.length);

  for (let i = 0; i < data.length; i += 4) {
    const value = data[i] >= threshold ? 255 : 0;
    output[i] = value;
    output[i + 1] = value;
    output[i + 2] = value;
    output[i + 3] = data[i + 3];
  }

  return output;
}

function buildImageDataVariants(source: ImageData): ImageData[] {
  const variants: ImageData[] = [source];
  const grayscale = toGrayscale(source.data);

  variants.push(new ImageData(grayscale, source.width, source.height));

  const contrastLevels = [80, 140, 200];
  for (const level of contrastLevels) {
    const contrasted = applyContrast(grayscale, level);
    variants.push(new ImageData(contrasted, source.width, source.height));
  }

  const thresholds = [90, 120, 150, 180];
  for (const threshold of thresholds) {
    const contrasted = applyContrast(grayscale, 180);
    const binary = applyBinaryThreshold(contrasted, threshold);
    variants.push(new ImageData(binary, source.width, source.height));
  }

  return variants;
}

function tryDecodeVariants(variants: ImageData[]): string | null {
  for (const variant of variants) {
    const result = jsQR(variant.data, variant.width, variant.height, {
      inversionAttempts: "attemptBoth",
    });

    if (result?.data) {
      return result.data;
    }
  }

  return null;
}

async function decodeQrFromImage(file: File): Promise<string | null> {
  const imageUrl = URL.createObjectURL(file);

  try {
    const img = await loadImage(imageUrl);
    const scales = [1, 1.5, 2];

    for (const scale of scales) {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      if (!ctx) {
        throw new Error("Canvas context를 생성할 수 없습니다.");
      }

      canvas.width = Math.max(1, Math.floor((img.naturalWidth || img.width) * scale));
      canvas.height = Math.max(1, Math.floor((img.naturalHeight || img.height) * scale));

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const sourceImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const variants = buildImageDataVariants(sourceImageData);
      const decoded = tryDecodeVariants(variants);

      if (decoded) {
        return decoded;
      }
    }

    return null;
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

const initialState: ScanState = {
  previewUrl: "",
  fileName: "",
  decodedText: "",
  isScanning: false,
  error: "",
};

export default function App(): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [state, setState] = useState<ScanState>(initialState);

  const resolvedUrl = useMemo(() => normalizeUrl(state.decodedText), [state.decodedText]);
  const isUrl = useMemo(() => Boolean(resolvedUrl), [resolvedUrl]);

  const handleOpenFileDialog = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleOpenLink = useCallback(() => {
    if (!resolvedUrl) return;
    window.open(resolvedUrl, "_blank", "noopener,noreferrer");
  }, [resolvedUrl]);

  const handleFileChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const nextPreviewUrl = URL.createObjectURL(file);

    setState((prev) => {
      if (prev.previewUrl) URL.revokeObjectURL(prev.previewUrl);

      return {
        previewUrl: nextPreviewUrl,
        fileName: file.name,
        decodedText: "",
        isScanning: true,
        error: "",
      };
    });

    try {
      const result = await decodeQrFromImage(file);

      if (!result) {
        setState((prev) => ({
          ...prev,
          isScanning: false,
          error: "QR 코드를 찾지 못했습니다. 더 선명한 이미지로 다시 시도해 주세요.",
        }));
        return;
      }

      setState((prev) => ({
        ...prev,
        decodedText: result,
        isScanning: false,
        error: "",
      }));
    } catch (error) {
      console.error(error);
      setState((prev) => ({
        ...prev,
        isScanning: false,
        error: "이미지를 처리하는 중 문제가 발생했습니다.",
      }));
    } finally {
      event.target.value = "";
    }
  }, []);

  useEffect(() => {
    return () => {
      if (state.previewUrl) {
        URL.revokeObjectURL(state.previewUrl);
      }
    };
  }, [state.previewUrl]);

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <section style={styles.card}>
          <div style={styles.header}>
            <div style={styles.badge}>React + TypeScript</div>
            <h1 style={styles.title}>QR 이미지에서 링크 버튼 생성</h1>
            <p style={styles.description}>
              이미지 업로드나 모바일 카메라 촬영으로 QR 코드를 읽고, 명도·대비를 보정한 전처리까지 거쳐 결과가 링크라면 바로 이동 가능한 버튼을 보여줍니다.
            </p>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />

          <button type="button" onClick={handleOpenFileDialog} style={styles.uploadBox}>
            <div style={styles.uploadIconWrap}>
              <Upload size={30} />
            </div>
            <div style={styles.uploadTitle}>QR 이미지 업로드</div>
            <div style={styles.uploadText}>모바일에서는 카메라 촬영 또는 갤러리 이미지 선택이 가능합니다.</div>
          </button>

          {state.previewUrl && (
            <div style={styles.previewWrap}>
              <div style={styles.previewHeader}>
                <span style={styles.previewLabel}>
                  <ImageIcon size={16} />
                  업로드한 이미지
                </span>
                <span style={styles.fileName}>{state.fileName}</span>
              </div>
              <div style={styles.previewBody}>
                <img
                  src={state.previewUrl}
                  alt="업로드한 QR 이미지 미리보기"
                  style={styles.previewImage}
                />
              </div>
            </div>
          )}
        </section>

        <section style={styles.card}>
          <div style={styles.header}>
            <h2 style={styles.subTitle}>
              <QrCode size={22} />
              스캔 결과
            </h2>
            <p style={styles.subDescription}>QR 원문과 링크 여부를 확인할 수 있습니다.</p>
          </div>

          {state.isScanning && <div style={styles.infoBox}>이미지를 분석하고 있습니다.</div>}

          {state.error && (
            <div style={styles.errorBox}>
              <AlertCircle size={18} />
              <span>{state.error}</span>
            </div>
          )}

          <div style={styles.fieldWrap}>
            <label htmlFor="decodedText" style={styles.label}>
              QR 원문
            </label>
            <input
              id="decodedText"
              value={state.decodedText}
              readOnly
              placeholder="아직 스캔된 결과가 없습니다."
              style={styles.input}
            />
          </div>

          {state.decodedText && !isUrl && (
            <div style={styles.warnBox}>
              QR 값은 읽었지만 일반적인 URL 형식으로 확정되지는 않았습니다.
            </div>
          )}

          {isUrl && (
            <div style={styles.linkCard}>
              <div style={styles.linkTitle}>
                <LinkIcon size={16} />
                이동할 링크
              </div>

              <a href={resolvedUrl} target="_blank" rel="noreferrer" style={styles.linkText}>
                {resolvedUrl}
              </a>

              <button type="button" onClick={handleOpenLink} style={styles.linkButton}>
                링크로 이동
                <ExternalLink size={16} />
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

type StyleMap = Record<string, React.CSSProperties>;

const styles: StyleMap = {
  page: {
    minHeight: "100vh",
    backgroundColor: "#f8fafc",
    padding: 24,
    boxSizing: "border-box",
  },
  container: {
    maxWidth: 1100,
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 24,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 24,
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
  },
  header: {
    marginBottom: 20,
  },
  badge: {
    display: "inline-block",
    padding: "6px 12px",
    borderRadius: 9999,
    backgroundColor: "#e2e8f0",
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 12,
  },
  title: {
    margin: 0,
    fontSize: 30,
    lineHeight: 1.25,
    color: "#0f172a",
  },
  description: {
    marginTop: 12,
    marginBottom: 0,
    color: "#475569",
    fontSize: 16,
    lineHeight: 1.6,
  },
  subTitle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    margin: 0,
    fontSize: 24,
    color: "#0f172a",
  },
  subDescription: {
    marginTop: 10,
    marginBottom: 0,
    color: "#475569",
    fontSize: 14,
    lineHeight: 1.6,
  },
  uploadBox: {
    width: "100%",
    minHeight: 220,
    border: "2px dashed #cbd5e1",
    borderRadius: 24,
    backgroundColor: "#ffffff",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    cursor: "pointer",
    padding: 24,
  },
  uploadIconWrap: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "#f1f5f9",
    marginBottom: 12,
  },
  uploadTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: "#0f172a",
  },
  uploadText: {
    marginTop: 8,
    color: "#64748b",
    fontSize: 14,
    lineHeight: 1.6,
  },
  previewWrap: {
    marginTop: 20,
    borderRadius: 24,
    border: "1px solid #e2e8f0",
    overflow: "hidden",
  },
  previewHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: "14px 16px",
    borderBottom: "1px solid #e2e8f0",
    fontSize: 14,
    color: "#475569",
  },
  previewLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  fileName: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  previewBody: {
    backgroundColor: "#f1f5f9",
    padding: 16,
    display: "flex",
    justifyContent: "center",
  },
  previewImage: {
    maxWidth: "100%",
    maxHeight: 360,
    borderRadius: 16,
    objectFit: "contain",
  },
  infoBox: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#f8fafc",
    color: "#475569",
    fontSize: 14,
  },
  errorBox: {
    marginTop: 12,
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#b91c1c",
    fontSize: 14,
    lineHeight: 1.6,
  },
  fieldWrap: {
    marginTop: 16,
  },
  label: {
    display: "block",
    marginBottom: 8,
    fontSize: 14,
    fontWeight: 700,
    color: "#334155",
  },
  input: {
    width: "100%",
    height: 48,
    padding: "0 14px",
    borderRadius: 16,
    border: "1px solid #cbd5e1",
    boxSizing: "border-box",
    fontSize: 14,
  },
  warnBox: {
    marginTop: 16,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#fffbeb",
    border: "1px solid #fde68a",
    color: "#92400e",
    fontSize: 14,
    lineHeight: 1.6,
  },
  linkCard: {
    marginTop: 16,
    padding: 18,
    borderRadius: 20,
    border: "1px solid #e2e8f0",
    backgroundColor: "#ffffff",
  },
  linkTitle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    fontSize: 14,
    fontWeight: 700,
    color: "#334155",
  },
  linkText: {
    display: "block",
    marginBottom: 14,
    color: "#2563eb",
    fontSize: 14,
    lineHeight: 1.6,
    wordBreak: "break-all",
  },
  linkButton: {
    width: "100%",
    minHeight: 48,
    border: "none",
    borderRadius: 16,
    backgroundColor: "#0f172a",
    color: "#ffffff",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "12px 16px",
  },
};
