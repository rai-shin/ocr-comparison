
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

type Technique =
  | "grayscale"
  | "resize"
  | "denoising"
  | "deskewing"
  | "contrast"
  | "adaptive_threshold";

type OCRResult = {
  text: string;
  confidence: number;
  flagged: boolean;
  [key: string]: unknown;
};

type OCRResponse = {
  success: boolean;
  engine: string;
  filename: string;
  text: string;
  confidence_summary: {
    average: number;
    total_lines: number;
    flagged_lines: number;
  };
  results: OCRResult[];
  preprocessing: {
    enabled: boolean;
    applied: string[];
    timings_ms: Record<string, number>;
    total_time_ms: number;
  };
  settings: Record<string, boolean>;
  processing_time_ms: {
    preprocessing: number;
    ocr: number;
    total: number;
  };
};

const API_URL =
  process.env.NEXT_PUBLIC_OCR_API_URL || "http://127.0.0.1:8000";

const techniques: {
  key: Technique;
  name: string;
  description: string;
}[] = [
  {
    key: "grayscale",
    name: "Grayscale",
    description: "Converts the image into shades of gray.",
  },
  {
    key: "resize",
    name: "Resize",
    description: "Adjusts image dimensions before OCR.",
  },
  {
    key: "denoising",
    name: "Denoising",
    description: "Reduces image noise and unwanted artifacts.",
  },
  {
    key: "deskewing",
    name: "Deskewing",
    description: "Corrects tilted or rotated text.",
  },
  {
    key: "contrast",
    name: "CLAHE Contrast",
    description: "Enhances local image contrast.",
  },
  {
    key: "adaptive_threshold",
    name: "Adaptive Thresholding",
    description: "Separates text from the background.",
  },
];

const presets: {
  label: string;
  technique?: Technique;
  all?: boolean;
}[] = [
  { label: "No preprocessing" },
  { label: "Grayscale", technique: "grayscale" },
  { label: "Resize", technique: "resize" },
  { label: "Denoising", technique: "denoising" },
  { label: "Deskewing", technique: "deskewing" },
  { label: "CLAHE", technique: "contrast" },
  { label: "Adaptive threshold", technique: "adaptive_threshold" },
  { label: "All six", all: true },
];

const emptySettings: Record<Technique, boolean> = {
  grayscale: false,
  resize: false,
  denoising: false,
  deskewing: false,
  contrast: false,
  adaptive_threshold: false,
};

function Metric({
  label,
  value,
  suffix = "",
}: {
  label: string;
  value: string | number;
  suffix?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900">
        {value}
        {suffix}
      </p>
    </div>
  );
}

function ResultPanel({
  title,
  color,
  result,
  loading,
  error,
}: {
  title: string;
  color: "blue" | "violet";
  result: OCRResponse | null;
  loading: boolean;
  error: string | null;
}) {
  const [showLines, setShowLines] = useState(false);

  const accent =
    color === "blue"
      ? "border-blue-200 bg-blue-50 text-blue-700"
      : "border-violet-200 bg-violet-50 text-violet-700";

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className={`flex items-center justify-between border-b p-4 ${accent}`}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider opacity-70">
            OCR Engine
          </p>
          <h2 className="text-lg font-bold">{title}</h2>
        </div>

        {loading ? (
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold">
            Processing...
          </span>
        ) : result ? (
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold">
            Complete
          </span>
        ) : (
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold">
            Waiting
          </span>
        )}
      </div>

      <div className="space-y-4 p-4">
        {loading && (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-slate-500">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
            <p className="text-sm">Running {title}...</p>
          </div>
        )}

        {error && !loading && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p className="font-semibold">Processing failed</p>
            <p className="mt-1 break-words">{error}</p>
          </div>
        )}

        {!loading && !result && !error && (
          <div className="flex min-h-48 items-center justify-center text-center text-sm text-slate-400">
            Results will appear here after comparison.
          </div>
        )}

        {result && !loading && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Metric
                label="Average confidence"
                value={result.confidence_summary.average.toFixed(2)}
                suffix="%"
              />
              <Metric
                label="Detected lines"
                value={result.confidence_summary.total_lines}
              />
              <Metric
                label="Flagged lines"
                value={result.confidence_summary.flagged_lines}
              />
              <Metric
                label="Preprocessing"
                value={result.processing_time_ms.preprocessing.toFixed(0)}
                suffix=" ms"
              />
              <Metric
                label="OCR time"
                value={result.processing_time_ms.ocr.toFixed(0)}
                suffix=" ms"
              />
              <Metric
                label="Total time"
                value={result.processing_time_ms.total.toFixed(0)}
                suffix=" ms"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800">
                  Extracted Text
                </h3>
                <span className="text-xs text-slate-400">
                  {result.text.length} characters
                </span>
              </div>

              <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-6 text-slate-700">
                {result.text || "No text detected."}
              </pre>
            </div>

            <div className="rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setShowLines(!showLines)}
                className="flex w-full items-center justify-between p-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <span>Individual detected lines ({result.results.length})</span>
                <span>{showLines ? "−" : "+"}</span>
              </button>

              {showLines && (
                <div className="max-h-80 space-y-2 overflow-auto border-t border-slate-200 p-3">
                  {result.results.map((line, index) => (
                    <div
                      key={index}
                      className={`rounded-lg border p-3 ${
                        line.flagged
                          ? "border-amber-200 bg-amber-50"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-500">
                          Line {index + 1}
                        </span>

                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-700">
                            {Number(line.confidence).toFixed(2)}%
                          </span>

                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              line.flagged
                                ? "bg-amber-200 text-amber-800"
                                : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            {line.flagged ? "FLAGGED" : "OK"}
                          </span>
                        </div>
                      </div>

                      <p className="whitespace-pre-wrap break-words text-sm text-slate-800">
                        {line.text}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export default function Home() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();

    const { error } = await supabase.auth.signOut();

    if (error) {
      alert("Unable to log out. Please try again.");
      return;
    }

    router.replace("/login");
    router.refresh();
  }

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [preprocessing, setPreprocessing] = useState(false);
  const [settings, setSettings] =
    useState<Record<Technique, boolean>>(emptySettings);

  const [paddleResult, setPaddleResult] =
    useState<OCRResponse | null>(null);
  const [tesseractResult, setTesseractResult] =
    useState<OCRResponse | null>(null);

  const [paddleLoading, setPaddleLoading] = useState(false);
  const [tesseractLoading, setTesseractLoading] = useState(false);
  const [paddleError, setPaddleError] = useState<string | null>(null);
  const [tesseractError, setTesseractError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState("");

  // Experiment saving states
  const [savingExperiment, setSavingExperiment] = useState(false);
  const [experimentSaved, setExperimentSaved] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");

  const [activePreset, setActivePreset] = useState("No preprocessing");

  // Image upload and webcam references
  const uploadRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const [cameraOpen, setCameraOpen] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  // Attach the webcam stream to the video element.
  useEffect(() => {
    if (!cameraOpen || !cameraStreamRef.current || !videoRef.current) {
      return;
    }

    videoRef.current.srcObject = cameraStreamRef.current;

    videoRef.current.play().catch(() => {
      setGeneralError("Unable to start the webcam preview.");
    });
  }, [cameraOpen]);

  // Stop the webcam when the component is removed.
  useEffect(() => {
    return () => {
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    };
  }, []);

  const activeTechniques = techniques.filter(
    (item) => settings[item.key]
  );

  function selectFile(selected: File | undefined) {
    if (!selected) return;

    const allowed = ["image/jpeg", "image/png", "image/webp"];

    if (!allowed.includes(selected.type)) {
      setGeneralError("Please select a JPG, PNG, or WEBP image.");
      return;
    }

    if (selected.size > 15 * 1024 * 1024) {
      setGeneralError("The image must not exceed 15 MB.");
      return;
    }

    setGeneralError("");
    setSaveMessage("");
    setSaveError("");
    setExperimentSaved(false);

    setFile(selected);
    setPaddleResult(null);
    setTesseractResult(null);
    setPaddleError(null);
    setTesseractError(null);
  }

  // Open the laptop webcam.
  async function openCamera() {
    setGeneralError("");

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "Camera access is unavailable. Open the website using localhost or HTTPS."
        );
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      cameraStreamRef.current = stream;
      setCameraOpen(true);
    } catch (error) {
      let message = "Unable to access your webcam.";

      if (error instanceof Error) {
        if (error.name === "NotAllowedError") {
          message =
            "Camera permission was denied. Allow camera access in Chrome settings and try again.";
        } else if (error.name === "NotFoundError") {
          message = "No webcam was detected on this device.";
        } else if (error.name === "NotReadableError") {
          message =
            "The webcam is already being used by another application. Close that application and try again.";
        } else {
          message = error.message;
        }
      }

      setGeneralError(message);
    }
  }

  // Close the webcam and release the device.
  function closeCamera() {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraOpen(false);
  }

  // Capture a photo from the live webcam preview.
  function capturePhoto() {
    const video = videoRef.current;

    if (!video || !video.videoWidth || !video.videoHeight) {
      setGeneralError("The camera is not ready yet. Please try again.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");

    if (!context) {
      setGeneralError("Unable to capture the camera image.");
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setGeneralError("Failed to capture the image.");
          return;
        }

        const capturedFile = new File(
          [blob],
          `webcam-capture-${Date.now()}.jpg`,
          { type: "image/jpeg" }
        );

        selectFile(capturedFile);
        closeCamera();
      },
      "image/jpeg",
      0.95
    );
  }

  function toggleTechnique(key: Technique) {
    setSettings((previous) => ({
      ...previous,
      [key]: !previous[key],
    }));

    setActivePreset("Custom configuration");
  }

  function applyPreset(preset: (typeof presets)[number]) {
    if (!preset.technique && !preset.all) {
      setSettings(emptySettings);
      setPreprocessing(false);
      setActivePreset(preset.label);
      return;
    }

    if (preset.all) {
      setSettings({
        grayscale: true,
        resize: true,
        denoising: true,
        deskewing: true,
        contrast: true,
        adaptive_threshold: true,
      });
    } else {
      setSettings({
        ...emptySettings,
        [preset.technique!]: true,
      });
    }

    setPreprocessing(true);
    setActivePreset(preset.label);
  }

  function resetSettings() {
    setSettings(emptySettings);
    setPreprocessing(false);
    setActivePreset("No preprocessing");
  }

  // Run one OCR engine and return its response for comparison saving.
  async function runEngine(
    endpoint: string,
    selectedFile: File,
    updateLoading: (value: boolean) => void,
    updateResult: (value: OCRResponse | null) => void,
    updateError: (value: string | null) => void
  ): Promise<OCRResponse | null> {
    updateLoading(true);
    updateError(null);
    updateResult(null);

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("preprocessing", String(preprocessing));

    techniques.forEach(({ key }) => {
      formData.append(key, String(settings[key]));
    });

    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : `Request failed (${response.status})`
        );
      }

      const result = data as OCRResponse;

      updateResult(result);

      return result;
    } catch (error) {
      updateError(
        error instanceof Error
          ? error.message
          : "An unexpected error occurred."
      );

      return null;
    } finally {
      updateLoading(false);
    }
  }

  async function runComparison() {
    if (!file) {
      setGeneralError("Please upload or capture an image first.");
      return;
    }

    setGeneralError("");
    setSaveMessage("");
    setSaveError("");
    setExperimentSaved(false);

    setPaddleResult(null);
    setTesseractResult(null);
    setPaddleError(null);
    setTesseractError(null);

    setPaddleLoading(true);
    setTesseractLoading(true);

    // Both engines receive the same image and preprocessing settings.
    await Promise.all([
      runEngine(
        "/api/ocr/paddle",
        file,
        setPaddleLoading,
        setPaddleResult,
        setPaddleError
      ),
      runEngine(
        "/api/ocr/tesseract",
        file,
        setTesseractLoading,
        setTesseractResult,
        setTesseractError
      ),
    ]);
  }

  // Save the original image and both OCR results to Supabase.
  async function saveExperiment() {
    if (!file || !paddleResult || !tesseractResult) {
      setSaveError(
        "Both OCR results and the original image are required."
      );
      return;
    }

    if (savingExperiment || experimentSaved) {
      return;
    }

    setSavingExperiment(true);
    setSaveError("");
    setSaveMessage("");

    const supabase = createClient();
    let storagePath = "";

    try {
      // Confirm that a user is logged in.
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error(
          "Please log in again before saving your experiment."
        );
      }

      // Create a unique storage path for the original image.
      const safeFilename = file.name.replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      );

      storagePath = `${user.id}/${Date.now()}-${safeFilename}`;

      // Upload the original image to the private bucket.
      const { error: uploadError } = await supabase.storage
        .from("ocr-documents")
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        throw new Error(
          `File upload failed: ${uploadError.message}`
        );
      }

      // Save the comparison results to the experiments table.
      const { error: insertError } = await supabase
        .from("experiments")
        .insert({
          filename: file.name,

          settings: {
            preprocessing,
            activePreset,
            techniques: settings,
          },

          paddleocr_result: paddleResult,
          tesseract_result: tesseractResult,

          ground_truth: null,

          metrics: {
            paddleocr: {
              average_confidence:
                paddleResult.confidence_summary.average,
              total_lines:
                paddleResult.confidence_summary.total_lines,
              flagged_lines:
                paddleResult.confidence_summary.flagged_lines,
              processing_time_ms:
                paddleResult.processing_time_ms,
            },

            tesseract: {
              average_confidence:
                tesseractResult.confidence_summary.average,
              total_lines:
                tesseractResult.confidence_summary.total_lines,
              flagged_lines:
                tesseractResult.confidence_summary.flagged_lines,
              processing_time_ms:
                tesseractResult.processing_time_ms,
            },
          },

          storage_path: storagePath,
          mime_type: file.type,
          file_size: file.size,
        });

      if (insertError) {
        // Remove the uploaded file if the database insert fails.
        const { error: cleanupError } = await supabase.storage
          .from("ocr-documents")
          .remove([storagePath]);

        if (cleanupError) {
          console.error(
            "Unable to remove uploaded file after database failure:",
            cleanupError.message
          );
        }

        storagePath = "";

        throw new Error(
          `Database save failed: ${insertError.message}`
        );
      }

      setExperimentSaved(true);
      setSaveMessage(
        "Comparison saved to experiment history."
      );
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while saving."
      );
    } finally {
      setSavingExperiment(false);
    }
  }

  const bothComplete =
    !paddleLoading &&
    !tesseractLoading &&
    (paddleResult !== null || tesseractResult !== null);

  const bothSucceeded =
    !paddleLoading &&
    !tesseractLoading &&
    paddleResult !== null &&
    tesseractResult !== null;

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-xl font-bold text-white">
            O
          </div>

          <div>
            <h1 className="text-xl font-bold tracking-tight">
              OCR Comparison
            </h1>
            <p className="text-xs text-slate-500">
              PaddleOCR vs. Tesseract
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <span className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 sm:inline-flex">
            Comparison Workspace
          </span>

          <Link
            href="/history"
            className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 sm:px-4"
          >
            History
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 sm:px-4"
          >
            Log out
          </button>
        </div>
      </div>
    </header>


      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <section>
          <p className="text-sm font-semibold text-blue-600">
            OCR TESTING ENVIRONMENT
          </p>

          <h2 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
            Compare OCR Results
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Upload the same image for both OCR engines, configure image
            preprocessing, and compare their extracted text, confidence,
            flagged lines, and processing times.
          </p>
        </section>

        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          {/* IMAGE INPUT */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h3 className="font-bold text-slate-900">
                1. Input Image
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Upload an existing image or capture a new photo using your webcam.
              </p>
            </div>

            {/* IMAGE OR CAMERA PREVIEW */}
            <div className="flex min-h-64 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-50">
              {cameraOpen ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="max-h-[420px] w-full object-contain"
                />
              ) : preview ? (
                <img
                  src={preview}
                  alt="Selected OCR test image"
                  className="max-h-[420px] w-full object-contain"
                />
              ) : (
                <div className="p-8 text-center">
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-2xl text-blue-700">
                    ↑
                  </div>

                  <p className="font-semibold text-slate-700">
                    No image selected
                  </p>

                  <p className="mt-1 text-xs text-slate-400">
                    JPG, PNG, or WEBP · Maximum 15 MB
                  </p>
                </div>
              )}
            </div>

            {/* FILE UPLOAD INPUT */}
            <input
              ref={uploadRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                selectFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />

            {/* UPLOAD AND CAMERA BUTTONS */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => uploadRef.current?.click()}
                disabled={cameraOpen}
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                ↑ Upload Image
              </button>

              <button
                type="button"
                onClick={cameraOpen ? closeCamera : openCamera}
                className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                {cameraOpen ? "✕ Close Camera" : "◎ Open Camera"}
              </button>
            </div>

            {/* CAPTURE BUTTON */}
            {cameraOpen && (
              <button
                type="button"
                onClick={capturePhoto}
                className="mt-3 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                Capture Photo
              </button>
            )}

            {/* SELECTED FILE INFORMATION */}
            {file && !cameraOpen && (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {file.name}
                  </p>

                  <p className="text-xs text-slate-500">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setPaddleResult(null);
                    setTesseractResult(null);
                    setPaddleError(null);
                    setTesseractError(null);
                    setGeneralError("");
                    setExperimentSaved(false);
                    setSaveMessage("");
                    setSaveError("");
                  }}
                  className="shrink-0 rounded-lg px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                >
                  Remove
                </button>
              </div>
            )}
          </section>

          {/* PREPROCESSING */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900">
                  2. Preprocessing Controls
                </h3>

                <p className="mt-1 text-xs text-slate-500">
                  Choose which image-processing techniques to apply.
                </p>
              </div>

              <button
                type="button"
                onClick={resetSettings}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Reset Settings
              </button>
            </div>

            <div className="mt-5 flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50 p-4">
              <div>
                <p className="font-semibold text-blue-900">
                  Preprocessing
                </p>

                <p className="mt-1 text-xs text-blue-700">
                  {preprocessing
                    ? "Selected techniques will be applied."
                    : "Original image will be used without preprocessing."}
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={preprocessing}
                onClick={() => setPreprocessing(!preprocessing)}
                className={`relative h-7 w-12 rounded-full transition ${
                  preprocessing ? "bg-blue-600" : "bg-slate-300"
                }`}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${
                    preprocessing ? "left-6" : "left-1"
                  }`}
                />
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {techniques.map((item) => (
                <label
                  key={item.key}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                    settings[item.key] && preprocessing
                      ? "border-blue-300 bg-blue-50"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={settings[item.key]}
                    onChange={() => toggleTechnique(item.key)}
                    className="mt-1 h-4 w-4 accent-blue-600"
                  />

                  <span>
                    <span className="block text-sm font-semibold text-slate-800">
                      {item.name}
                    </span>

                    <span className="mt-1 block text-xs leading-5 text-slate-500">
                      {item.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>

            <div className="mt-5 rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-slate-800">
                  Selected Configuration
                </h4>

                <span className="text-xs font-medium text-slate-500">
                  {activePreset}
                </span>
              </div>

              {!preprocessing || activeTechniques.length === 0 ? (
                <p className="mt-3 text-sm text-slate-400">
                  No preprocessing techniques will be applied.
                </p>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {activeTechniques.map((item) => (
                    <span
                      key={item.key}
                      className="rounded-full bg-blue-100 px-3 py-1.5 text-xs font-semibold text-blue-700"
                    >
                      {item.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* PRESET CONFIGURATIONS */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <h3 className="font-bold text-slate-900">
              3. Quick Test Configurations
            </h3>

            <p className="mt-1 text-xs text-slate-500">
              Quickly reproduce the eight configurations used in the
              previous experiments.
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {presets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset)}
                className={`rounded-xl border px-3 py-3 text-sm font-semibold transition ${
                  activePreset === preset.label
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </section>

        {/* RUN COMPARISON */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-bold text-slate-900">
                4. Run OCR Comparison
              </h3>

              <p className="mt-1 text-xs text-slate-500">
                Both engines will process the same image using the selected
                configuration.
              </p>
            </div>

            <button
              type="button"
              disabled={!file || paddleLoading || tesseractLoading || cameraOpen}
              onClick={runComparison}
              className="rounded-xl bg-blue-600 px-7 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {paddleLoading || tesseractLoading
                ? "Running Comparison..."
                : "Run Comparison →"}
            </button>
          </div>

          {generalError && (
            <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {generalError}
            </p>
          )}

          {/* SAVE EXPERIMENT */}
          {bothSucceeded && (
            <div className="mt-5 border-t border-slate-200 pt-5">
              <button
                type="button"
                onClick={saveExperiment}
                disabled={savingExperiment || experimentSaved}
                className="w-full rounded-xl bg-emerald-600 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {savingExperiment
                  ? "Saving Experiment..."
                  : experimentSaved
                    ? "✓ Experiment Saved"
                    : "Save Experiment"}
              </button>

              {saveMessage && (
                <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
                  {saveMessage}
                </p>
              )}

              {saveError && (
                <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  {saveError}
                </p>
              )}
            </div>
          )}
        </section>

        {/* RESULTS */}
        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xl font-bold text-slate-900">
                Comparison Results
              </h3>

              <p className="mt-1 text-xs text-slate-500">
                Results from the two OCR engines.
              </p>
            </div>

            {bothComplete && (
              <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                Test completed
              </span>
            )}
          </div>

          <div className="grid items-start gap-5 lg:grid-cols-2">
            <ResultPanel
              title="PaddleOCR"
              color="blue"
              result={paddleResult}
              loading={paddleLoading}
              error={paddleError}
            />

            <ResultPanel
              title="Tesseract"
              color="violet"
              result={tesseractResult}
              loading={tesseractLoading}
              error={tesseractError}
            />
          </div>
        </section>

        <footer className="pb-6 pt-2 text-center text-xs text-slate-400">
          OCR Comparison Workspace · PaddleOCR and Tesseract testing
        </footer>
      </div>
    </main>
  );
}
