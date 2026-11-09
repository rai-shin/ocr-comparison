
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Experiment = {
  id: string;
  created_at: string;
  filename: string;
  settings: Record<string, unknown> | null;
  paddleocr_result: Record<string, unknown> | null;
  tesseract_result: Record<string, unknown> | null;
  ground_truth: string | null;
  metrics: Record<string, unknown> | null;
  storage_path: string | null;
  mime_type: string | null;
  file_size: number | null;
};

type EngineKey = "paddleocr" | "tesseract";

type AccuracyMetrics = {
  cer: number;
  wer: number;
  characterErrors: number;
  wordErrors: number;
  characterCount: number;
  wordCount: number;
  cerAccuracy: number;
  werAccuracy: number;
};

function getNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function getObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function getSavedAccuracy(
  experiment: Experiment,
  engine: EngineKey
): AccuracyMetrics | null {
  if (!experiment.ground_truth?.trim()) {
    return null;
  }

  const engineMetrics = getObject(
    getObject(experiment.metrics)[engine]
  );

  const evaluation = getObject(engineMetrics.evaluation);

  const requiredFields = [
    "cer",
    "wer",
    "characterErrors",
    "wordErrors",
    "characterCount",
    "wordCount",
    "cerAccuracy",
    "werAccuracy",
  ];

  if (
    !requiredFields.every(
      (field) =>
        evaluation[field] !== undefined &&
        evaluation[field] !== null &&
        Number.isFinite(Number(evaluation[field]))
    )
  ) {
    return null;
  }

  return {
    cer: getNumber(evaluation.cer),
    wer: getNumber(evaluation.wer),
    characterErrors: getNumber(evaluation.characterErrors),
    wordErrors: getNumber(evaluation.wordErrors),
    characterCount: getNumber(evaluation.characterCount),
    wordCount: getNumber(evaluation.wordCount),
    cerAccuracy: getNumber(evaluation.cerAccuracy),
    werAccuracy: getNumber(evaluation.werAccuracy),
  };
}

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFileSize(bytes: number | null) {
  if (!bytes) return "Unknown";

  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getTechniques(experiment: Experiment) {
  const settings = getObject(experiment.settings);
  const techniques = getObject(settings.techniques);

  return Object.entries(techniques)
    .filter(([, enabled]) => enabled === true)
    .map(([key]) => key.replaceAll("_", " "));
}

function getPreset(experiment: Experiment) {
  const settings = getObject(experiment.settings);

  if (typeof settings.activePreset === "string") {
    return settings.activePreset;
  }

  const techniques = getTechniques(experiment);

  return techniques.length
    ? techniques.join(" + ")
    : "No preprocessing";
}

function getEngineData(experiment: Experiment, engine: EngineKey) {
  const result =
    engine === "paddleocr"
      ? getObject(experiment.paddleocr_result)
      : getObject(experiment.tesseract_result);

  const metrics = getObject(getObject(experiment.metrics)[engine]);
  const confidence = getObject(result.confidence_summary);
  const processing = getObject(result.processing_time_ms);

  const metricsProcessing = metrics.processing_time_ms;
  const metricsProcessingObject = getObject(metricsProcessing);

  const totalTime =
    processing.total !== undefined && processing.total !== null
      ? getNumber(processing.total)
      : metricsProcessingObject.total !== undefined &&
          metricsProcessingObject.total !== null
        ? getNumber(metricsProcessingObject.total)
        : getNumber(metricsProcessing);

  return {
    averageConfidence: getNumber(
      metrics.average_confidence ?? confidence.average
    ),
    totalLines: getNumber(
      metrics.total_lines ?? confidence.total_lines
    ),
    flaggedLines: getNumber(
      metrics.flagged_lines ?? confidence.flagged_lines
    ),
    preprocessingTime: getNumber(processing.preprocessing),
    ocrTime: getNumber(processing.ocr),
    totalTime,
    text: typeof result.text === "string" ? result.text : "",
  };
}

function getEngineAccuracy(
  experiment: Experiment,
  engine: EngineKey
) {
  return getSavedAccuracy(experiment, engine);
}

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
        {value}{suffix}
      </p>
    </div>
  );
}

function AccuracyCard({
  title,
  accuracy,
  color,
}: {
  title: string;
  accuracy: AccuracyMetrics | null;
  color: "blue" | "violet";
}) {
  const accent =
    color === "blue"
      ? "border-blue-200 bg-blue-50"
      : "border-violet-200 bg-violet-50";

  const heading =
    color === "blue" ? "text-blue-800" : "text-violet-800";

  if (!accuracy) {
    return (
      <div className={`rounded-xl border p-4 ${accent}`}>
        <h4 className={`font-bold ${heading}`}>{title}</h4>
        <p className="mt-2 text-sm text-slate-500">
          Accuracy unavailable. Save Ground Truth to generate and store
          the evaluation metrics.
        </p>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border p-4 ${accent}`}>
      <h4 className={`font-bold ${heading}`}>{title}</h4>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Metric
          label="CER"
          value={accuracy.cer.toFixed(2)}
          suffix="%"
        />
        <Metric
          label="WER"
          value={accuracy.wer.toFixed(2)}
          suffix="%"
        />
        <Metric
          label="Character accuracy"
          value={accuracy.cerAccuracy.toFixed(2)}
          suffix="%"
        />
        <Metric
          label="Word accuracy"
          value={accuracy.werAccuracy.toFixed(2)}
          suffix="%"
        />
      </div>

      <div className="mt-3 space-y-1 text-xs text-slate-600">
        <p>
          Character errors: {accuracy.characterErrors} /{" "}
          {accuracy.characterCount}
        </p>
        <p>
          Word errors: {accuracy.wordErrors} / {accuracy.wordCount}
        </p>
      </div>
    </div>
  );
}

function EngineDetails({
  title,
  result,
  color,
  accuracy,
}: {
  title: string;
  result: Record<string, unknown> | null;
  color: "blue" | "violet";
  accuracy: AccuracyMetrics | null;
}) {
  const confidence = getObject(result?.confidence_summary);
  const processing = getObject(result?.processing_time_ms);
  const extractedText =
    typeof result?.text === "string" ? result.text : "";

  const accent =
    color === "blue"
      ? "border-blue-200 bg-blue-50 text-blue-700"
      : "border-violet-200 bg-violet-50 text-violet-700";

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className={`border-b p-4 ${accent}`}>
        <p className="text-xs font-semibold uppercase tracking-wider opacity-70">
          OCR Engine
        </p>
        <h3 className="text-lg font-bold">{title}</h3>
      </div>

      <div className="space-y-4 p-4">
        {!result ? (
          <p className="text-sm text-slate-400">
            No saved result available.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Metric
                label="Average confidence"
                value={getNumber(confidence.average).toFixed(2)}
                suffix="%"
              />
              <Metric
                label="Detected lines"
                value={getNumber(confidence.total_lines)}
              />
              <Metric
                label="Flagged lines"
                value={getNumber(confidence.flagged_lines)}
              />
              <Metric
                label="Preprocessing"
                value={getNumber(processing.preprocessing).toFixed(0)}
                suffix=" ms"
              />
              <Metric
                label="OCR time"
                value={getNumber(processing.ocr).toFixed(0)}
                suffix=" ms"
              />
              <Metric
                label="Total time"
                value={getNumber(processing.total).toFixed(0)}
                suffix=" ms"
              />
            </div>

            <div>
              <h4 className="mb-2 text-sm font-bold text-slate-800">
                Accuracy Evaluation
              </h4>

              <AccuracyCard
                title={`${title} Accuracy`}
                accuracy={accuracy}
                color={color}
              />
            </div>

            <div>
              <h4 className="mb-2 text-sm font-bold text-slate-800">
                Extracted Text
              </h4>

              <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-6 text-slate-700">
                {extractedText || "No text detected."}
              </pre>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function ComparisonEngine({
  title,
  engine,
  first,
  second,
  color,
}: {
  title: string;
  engine: EngineKey;
  first: Experiment;
  second: Experiment;
  color: "blue" | "violet";
}) {
  const firstData = getEngineData(first, engine);
  const secondData = getEngineData(second, engine);

  const firstAccuracy = getEngineAccuracy(first, engine);
  const secondAccuracy = getEngineAccuracy(second, engine);

  const accuracyRows = [
    {
      label: "CER",
      first: firstAccuracy
        ? `${firstAccuracy.cer.toFixed(2)}%`
        : "N/A",
      second: secondAccuracy
        ? `${secondAccuracy.cer.toFixed(2)}%`
        : "N/A",
      difference:
        firstAccuracy && secondAccuracy
          ? `${(secondAccuracy.cer - firstAccuracy.cer).toFixed(2)} percentage points`
          : "N/A",
    },
    {
      label: "WER",
      first: firstAccuracy
        ? `${firstAccuracy.wer.toFixed(2)}%`
        : "N/A",
      second: secondAccuracy
        ? `${secondAccuracy.wer.toFixed(2)}%`
        : "N/A",
      difference:
        firstAccuracy && secondAccuracy
          ? `${(secondAccuracy.wer - firstAccuracy.wer).toFixed(2)} percentage points`
          : "N/A",
    },
    {
      label: "Character accuracy",
      first: firstAccuracy
        ? `${firstAccuracy.cerAccuracy.toFixed(2)}%`
        : "N/A",
      second: secondAccuracy
        ? `${secondAccuracy.cerAccuracy.toFixed(2)}%`
        : "N/A",
      difference:
        firstAccuracy && secondAccuracy
          ? `${(secondAccuracy.cerAccuracy - firstAccuracy.cerAccuracy).toFixed(2)} percentage points`
          : "N/A",
    },
    {
      label: "Word accuracy",
      first: firstAccuracy
        ? `${firstAccuracy.werAccuracy.toFixed(2)}%`
        : "N/A",
      second: secondAccuracy
        ? `${secondAccuracy.werAccuracy.toFixed(2)}%`
        : "N/A",
      difference:
        firstAccuracy && secondAccuracy
          ? `${(secondAccuracy.werAccuracy - firstAccuracy.werAccuracy).toFixed(2)} percentage points`
          : "N/A",
    },
  ];

  const rows = [
    {
      label: "Average confidence",
      first: `${firstData.averageConfidence.toFixed(2)}%`,
      second: `${secondData.averageConfidence.toFixed(2)}%`,
      difference: `${(
        secondData.averageConfidence - firstData.averageConfidence
      ).toFixed(2)} percentage points`,
    },
    {
      label: "Detected lines",
      first: firstData.totalLines,
      second: secondData.totalLines,
      difference: secondData.totalLines - firstData.totalLines,
    },
    {
      label: "Flagged lines",
      first: firstData.flaggedLines,
      second: secondData.flaggedLines,
      difference: secondData.flaggedLines - firstData.flaggedLines,
    },
    {
      label: "Preprocessing time",
      first: `${firstData.preprocessingTime.toFixed(0)} ms`,
      second: `${secondData.preprocessingTime.toFixed(0)} ms`,
      difference: `${(
        secondData.preprocessingTime - firstData.preprocessingTime
      ).toFixed(0)} ms`,
    },
    {
      label: "OCR time",
      first: `${firstData.ocrTime.toFixed(0)} ms`,
      second: `${secondData.ocrTime.toFixed(0)} ms`,
      difference: `${(
        secondData.ocrTime - firstData.ocrTime
      ).toFixed(0)} ms`,
    },
    {
      label: "Total processing time",
      first: `${firstData.totalTime.toFixed(0)} ms`,
      second: `${secondData.totalTime.toFixed(0)} ms`,
      difference: `${(
        secondData.totalTime - firstData.totalTime
      ).toFixed(0)} ms`,
    },
  ];

  const accent =
    color === "blue"
      ? "border-blue-200 bg-blue-50 text-blue-800"
      : "border-violet-200 bg-violet-50 text-violet-800";

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className={`border-b p-4 ${accent}`}>
        <p className="text-xs font-semibold uppercase tracking-wider opacity-70">
          Engine Comparison
        </p>
        <h3 className="text-lg font-bold">{title}</h3>
      </div>

      <div className="overflow-x-auto p-4">
        <h4 className="mb-2 font-bold text-slate-800">
          OCR Performance Metrics
        </h4>

        <table className="w-full min-w-[540px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs text-slate-500">
              <th className="px-3 py-3 font-semibold">Metric</th>
              <th className="px-3 py-3 font-semibold">Experiment A</th>
              <th className="px-3 py-3 font-semibold">Experiment B</th>
              <th className="px-3 py-3 font-semibold">Difference (B − A)</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr
                key={row.label}
                className="border-b border-slate-100 last:border-0"
              >
                <td className="px-3 py-3 font-semibold text-slate-700">
                  {row.label}
                </td>
                <td className="px-3 py-3 text-slate-600">{row.first}</td>
                <td className="px-3 py-3 text-slate-600">{row.second}</td>
                <td className="px-3 py-3 font-semibold text-slate-800">
                  {row.difference}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h4 className="mb-2 mt-6 font-bold text-slate-800">
          Accuracy Evaluation Metrics
        </h4>

        <table className="w-full min-w-[540px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs text-slate-500">
              <th className="px-3 py-3 font-semibold">Metric</th>
              <th className="px-3 py-3 font-semibold">Experiment A</th>
              <th className="px-3 py-3 font-semibold">Experiment B</th>
              <th className="px-3 py-3 font-semibold">Difference (B − A)</th>
            </tr>
          </thead>

          <tbody>
            {accuracyRows.map((row) => (
              <tr
                key={row.label}
                className="border-b border-slate-100 last:border-0"
              >
                <td className="px-3 py-3 font-semibold text-slate-700">
                  {row.label}
                </td>
                <td className="px-3 py-3 text-slate-600">{row.first}</td>
                <td className="px-3 py-3 text-slate-600">{row.second}</td>
                <td className="px-3 py-3 font-semibold text-slate-800">
                  {row.difference}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 border-t border-slate-200 p-4 lg:grid-cols-2">
        <div className="min-w-0">
          <h4 className="mb-2 text-sm font-bold text-slate-800">
            Experiment A · Extracted Text
          </h4>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-6 text-slate-700">
            {firstData.text || "No text detected."}
          </pre>
        </div>

        <div className="min-w-0">
          <h4 className="mb-2 text-sm font-bold text-slate-800">
            Experiment B · Extracted Text
          </h4>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-6 text-slate-700">
            {secondData.text || "No text detected."}
          </pre>
        </div>
      </div>
    </section>
  );
}

export default function HistoryPage() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Experiment | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState("");
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState("");

  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  const [showComparison, setShowComparison] = useState(false);

  const [groundTruth, setGroundTruth] = useState("");
  const [savingGroundTruth, setSavingGroundTruth] = useState(false);
  const [groundTruthMessage, setGroundTruthMessage] = useState("");
  const [groundTruthError, setGroundTruthError] = useState("");

  const loadExperiments = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const supabase = createClient();

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error("Please log in to view experiment history.");
      }

      const { data, error: queryError } = await supabase
        .from("experiments")
        .select("*")
        .order("created_at", { ascending: false });

      if (queryError) {
        throw new Error(queryError.message);
      }

      setExperiments((data ?? []) as Experiment[]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load experiment history."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadExperiments();
  }, [loadExperiments]);

  const filteredExperiments = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return experiments;

    return experiments.filter((experiment) => {
      const enabledTechniques = getTechniques(experiment).join(" ");

      return (
        experiment.filename.toLowerCase().includes(query) ||
        enabledTechniques.includes(query) ||
        getPreset(experiment).toLowerCase().includes(query)
      );
    });
  }, [experiments, search]);

  const comparisonExperiments = useMemo(() => {
    return comparisonIds
      .map((id) => experiments.find((item) => item.id === id))
      .filter((item): item is Experiment => Boolean(item));
  }, [comparisonIds, experiments]);

  function toggleComparison(id: string) {
    setShowComparison(false);

    setComparisonIds((current) => {
      if (current.includes(id)) {
        return current.filter((item) => item !== id);
      }

      if (current.length >= 2) {
        return current;
      }

      return [...current, id];
    });
  }

  async function openExperiment(experiment: Experiment) {
    setSelected(experiment);
    setGroundTruth(experiment.ground_truth ?? "");
    setGroundTruthMessage("");
    setGroundTruthError("");
    setOriginalImageUrl("");
    setImageError("");

    if (!experiment.storage_path) {
      setImageError("No original image path was saved for this experiment.");
      return;
    }

    setImageLoading(true);

    try {
      const supabase = createClient();

      const { data, error: storageError } = await supabase.storage
        .from("ocr-documents")
        .createSignedUrl(experiment.storage_path, 300);

      if (storageError) {
        throw new Error(storageError.message);
      }

      setOriginalImageUrl(data.signedUrl);
    } catch (err) {
      setImageError(
        err instanceof Error
          ? err.message
          : "Unable to retrieve the original image."
      );
    } finally {
      setImageLoading(false);
    }
  }

  async function saveGroundTruth() {
    if (!selected) return;

    if (!groundTruth.trim()) {
      setGroundTruthError(
        "Please enter the correct document text before saving."
      );
      setGroundTruthMessage("");
      return;
    }

    setSavingGroundTruth(true);
    setGroundTruthError("");
    setGroundTruthMessage("");

    try {
      const response = await fetch(
        `/api/experiments/${selected.id}/ground-truth`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            groundTruth,
          }),
        }
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error || "Unable to save Ground Truth."
        );
      }

      const updatedExperiment: Experiment = {
        ...selected,
        ground_truth: responseData.ground_truth ?? groundTruth,
        metrics: responseData.metrics ?? selected.metrics,
      };

      setSelected(updatedExperiment);

      setExperiments((current) =>
        current.map((item) =>
          item.id === selected.id ? updatedExperiment : item
        )
      );

      setGroundTruth(
        updatedExperiment.ground_truth ?? groundTruth
      );

      setGroundTruthMessage(
        "Ground Truth and evaluation metrics saved successfully."
      );
    } catch (err) {
      setGroundTruthError(
        err instanceof Error
          ? err.message
          : "Unable to save Ground Truth."
      );
    } finally {
      setSavingGroundTruth(false);
    }
  }

  const paddleConfidence = (experiment: Experiment) =>
    getNumber(
      getObject(experiment.metrics?.paddleocr).average_confidence
    );

  const tesseractConfidence = (experiment: Experiment) =>
    getNumber(
      getObject(experiment.metrics?.tesseract).average_confidence
    );

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-xl font-bold text-white">
              O
            </div>

            <div>
              <h1 className="text-xl font-bold tracking-tight">
                OCR Comparison
              </h1>
              <p className="text-xs text-slate-500">
                Experiment History
              </p>
            </div>
          </div>

          <Link
            href="/"
            className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            ← Back to Workspace
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <section>
          <p className="text-sm font-semibold text-blue-600">
            EXPERIMENT RECORDS
          </p>

          <h2 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
            OCR Experiment History
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Browse saved OCR comparisons, review preprocessing
            configurations, and compare the results from both OCR engines.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <Metric label="Total experiments" value={experiments.length} />
          <Metric
            label="Matching experiments"
            value={filteredExperiments.length}
          />
          <Metric
            label="Stored original images"
            value={experiments.filter((item) => item.storage_path).length}
          />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-bold text-slate-900">
                Saved Experiments
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Select exactly two experiments to compare.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setComparisonIds([]);
                  setShowComparison(false);
                }}
                disabled={comparisonIds.length === 0}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                Clear selection
              </button>

              <button
                type="button"
                onClick={() => setShowComparison(true)}
                disabled={comparisonExperiments.length !== 2}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Compare Selected ({comparisonIds.length}/2)
              </button>

              <button
                type="button"
                onClick={loadExperiments}
                disabled={loading}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {loading ? "Refreshing..." : "↻ Refresh"}
              </button>
            </div>
          </div>

          <div className="mt-4">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search filename or preprocessing technique..."
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
            {comparisonIds.length === 0
              ? "Choose two experiments using the checkboxes below."
              : comparisonIds.length === 1
                ? "One experiment selected. Choose one more."
                : "Two experiments selected. You can now compare them."}
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex min-h-48 items-center justify-center gap-3 text-sm text-slate-500">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
              Loading experiment history...
            </div>
          ) : !error && filteredExperiments.length === 0 ? (
            <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
              <p className="font-semibold text-slate-700">
                No experiments found
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {search
                  ? "Try another search term."
                  : "Your saved OCR comparisons will appear here."}
              </p>
            </div>
          ) : !error ? (
            <div className="mt-5 space-y-3">
              {filteredExperiments.map((experiment) => {
                const isChecked = comparisonIds.includes(experiment.id);
                const selectionDisabled =
                  comparisonIds.length >= 2 && !isChecked;

                return (
                  <article
                    key={experiment.id}
                    className={`rounded-xl border p-4 transition ${
                      isChecked
                        ? "border-blue-400 bg-blue-50/50"
                        : "border-slate-200 hover:border-blue-300 hover:bg-blue-50/30"
                    }`}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={selectionDisabled}
                          onChange={() => toggleComparison(experiment.id)}
                          aria-label={`Select ${experiment.filename} for comparison`}
                          className="mt-1 h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-30"
                        />

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-bold uppercase text-blue-700">
                              {isChecked
                                ? `Selected ${comparisonIds.indexOf(experiment.id) + 1}`
                                : "Saved"}
                            </span>

                            <span className="text-xs text-slate-400">
                              {formatDate(experiment.created_at)}
                            </span>

                            {experiment.ground_truth && (
                              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold uppercase text-emerald-700">
                                Ground Truth saved
                              </span>
                            )}
                          </div>

                          <h4 className="mt-2 truncate font-bold text-slate-900">
                            {experiment.filename}
                          </h4>

                          <p className="mt-1 text-xs text-slate-500">
                            Configuration: {getPreset(experiment)}
                          </p>

                          <p className="mt-1 text-xs text-slate-400">
                            {formatFileSize(experiment.file_size)}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 sm:min-w-56">
                        <div className="rounded-lg bg-blue-50 p-3">
                          <p className="text-[10px] font-semibold text-blue-600">
                            PaddleOCR
                          </p>
                          <p className="mt-1 text-lg font-bold text-blue-800">
                            {paddleConfidence(experiment).toFixed(2)}%
                          </p>
                        </div>

                        <div className="rounded-lg bg-violet-50 p-3">
                          <p className="text-[10px] font-semibold text-violet-600">
                            Tesseract
                          </p>
                          <p className="mt-1 text-lg font-bold text-violet-800">
                            {tesseractConfidence(experiment).toFixed(2)}%
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => openExperiment(experiment)}
                        className="shrink-0 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
                      >
                        View Details →
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>

        {showComparison && comparisonExperiments.length === 2 && (
          <section
            id="experiment-comparison"
            className="scroll-mt-5 space-y-5 rounded-2xl border border-blue-200 bg-white p-4 shadow-sm sm:p-6"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-blue-600">
                  Analysis
                </p>
                <h3 className="mt-1 text-xl font-bold text-slate-900">
                  Experiment Comparison
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Compare the preprocessing configurations and OCR results.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowComparison(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Close Comparison ✕
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {comparisonExperiments.map((experiment, index) => (
                <div
                  key={experiment.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-bold uppercase text-blue-700">
                    Experiment {index === 0 ? "A" : "B"}
                  </span>

                  <h4 className="mt-3 break-words font-bold text-slate-900">
                    {experiment.filename}
                  </h4>

                  <p className="mt-1 text-xs text-slate-500">
                    {formatDate(experiment.created_at)}
                  </p>

                  <p className="mt-3 text-sm font-semibold text-slate-700">
                    {getPreset(experiment)}
                  </p>

                  <div className="mt-2 flex flex-wrap gap-2">
                    {getTechniques(experiment).length > 0 ? (
                      getTechniques(experiment).map((technique) => (
                        <span
                          key={technique}
                          className="rounded-full bg-white px-2.5 py-1 text-xs capitalize text-slate-600"
                        >
                          {technique}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-400">
                        No preprocessing applied
                      </span>
                    )}
                  </div>

                  <p className="mt-3 text-xs text-slate-500">
                    Ground Truth:{" "}
                    {experiment.ground_truth
                      ? "Available"
                      : "Not provided"}
                  </p>
                </div>
              ))}
            </div>

            <ComparisonEngine
              title="PaddleOCR"
              engine="paddleocr"
              first={comparisonExperiments[0]}
              second={comparisonExperiments[1]}
              color="blue"
            />

            <ComparisonEngine
              title="Tesseract"
              engine="tesseract"
              first={comparisonExperiments[0]}
              second={comparisonExperiments[1]}
              color="violet"
            />

            <p className="text-xs leading-5 text-slate-400">
              Difference is calculated as Experiment B minus Experiment A.
              For CER and WER, a negative difference means Experiment B has
              fewer recognition errors. For accuracy, a positive difference
              means Experiment B performs better. These metrics are compared
              using each experiment&apos;s saved Ground Truth evaluation.
            </p>
          </section>
        )}

        {selected && (
          <div
            className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-3 sm:p-6"
            onClick={() => setSelected(null)}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-label="Experiment details"
              className="mx-auto my-4 max-w-6xl rounded-2xl bg-slate-100 shadow-2xl sm:my-8"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-t-2xl border-b border-slate-200 bg-white p-4 sm:p-5">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                    Experiment Details
                  </p>
                  <h3 className="mt-1 truncate font-bold text-slate-900">
                    {selected.filename}
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Close ✕
                </button>
              </div>

              <div className="space-y-5 p-4 sm:p-6">
                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <h4 className="font-bold text-slate-900">
                    Experiment Information
                  </h4>

                  <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <p className="text-xs text-slate-400">Date saved</p>
                      <p className="mt-1 font-medium">
                        {formatDate(selected.created_at)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-400">File size</p>
                      <p className="mt-1 font-medium">
                        {formatFileSize(selected.file_size)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-400">MIME type</p>
                      <p className="mt-1 font-medium">
                        {selected.mime_type || "Unknown"}
                      </p>
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border border-emerald-200 bg-white p-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                      Accuracy Evaluation · Step 1
                    </p>
                    <h4 className="mt-1 font-bold text-slate-900">
                      Ground Truth Text
                    </h4>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      Enter the manually verified, correct text from the
                      original document. This serves as the reference for
                      evaluating both OCR engines.
                    </p>
                  </div>

                  <textarea
                    value={groundTruth}
                    onChange={(event) => {
                      setGroundTruth(event.target.value);
                      setGroundTruthMessage("");
                      setGroundTruthError("");
                    }}
                    rows={9}
                    placeholder="Type or paste the correct text from the original document here..."
                    className="mt-4 w-full resize-y rounded-xl border border-slate-300 bg-white p-4 font-mono text-sm leading-6 text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  />

                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-slate-400">
                      {groundTruth.length.toLocaleString()} characters
                    </p>

                    <button
                      type="button"
                      onClick={saveGroundTruth}
                      disabled={savingGroundTruth}
                      className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingGroundTruth
                        ? "Saving..."
                        : "Save Ground Truth"}
                    </button>
                  </div>

                  {groundTruthError && (
                    <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      {groundTruthError}
                    </p>
                  )}

                  {groundTruthMessage && (
                    <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                      {groundTruthMessage}
                    </p>
                  )}
                </section>

                <section className="rounded-xl border border-blue-200 bg-white p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-blue-600">
                    Accuracy Evaluation · Step 2
                  </p>
                  <h4 className="mt-1 font-bold text-slate-900">
                    OCR Accuracy Results
                  </h4>

                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    Evaluation metrics are calculated and saved to the
                    database when you save Ground Truth. The values shown
                    here are retrieved from the saved experiment record.
                  </p>

                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <AccuracyCard
                      title="PaddleOCR"
                      accuracy={getEngineAccuracy(selected, "paddleocr")}
                      color="blue"
                    />

                    <AccuracyCard
                      title="Tesseract"
                      accuracy={getEngineAccuracy(selected, "tesseract")}
                      color="violet"
                    />
                  </div>

                  <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-500">
                    <p>
                      <strong>CER:</strong> Character Error Rate. Measures
                      character-level insertions, deletions, and substitutions.
                    </p>
                    <p className="mt-1">
                      <strong>WER:</strong> Word Error Rate. Measures
                      word-level insertions, deletions, and substitutions.
                    </p>
                    <p className="mt-1">
                      <strong>Accuracy:</strong> 100% minus the corresponding
                      error rate, with displayed accuracy capped at 0%.
                    </p>
                    <p className="mt-1">
                      Whitespace is normalized. Capitalization, punctuation,
                      spelling, and numbers remain significant.
                    </p>
                  </div>
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <h4 className="font-bold text-slate-900">
                    Preprocessing Configuration
                  </h4>

                  <p className="mt-2 text-sm text-slate-600">
                    Preset: {getPreset(selected)}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {getTechniques(selected).map((technique) => (
                      <span
                        key={technique}
                        className="rounded-full bg-blue-100 px-3 py-1.5 text-xs font-semibold capitalize text-blue-700"
                      >
                        {technique}
                      </span>
                    ))}
                  </div>

                  {getTechniques(selected).length === 0 && (
                    <p className="mt-3 text-sm text-slate-400">
                      No preprocessing techniques applied.
                    </p>
                  )}
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <h4 className="font-bold text-slate-900">
                    Original Document
                  </h4>

                  {imageLoading && (
                    <p className="mt-3 text-sm text-slate-500">
                      Loading original image...
                    </p>
                  )}

                  {imageError && (
                    <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
                      {imageError}
                    </p>
                  )}

                  {originalImageUrl && (
                    <div className="mt-3">
                      <img
                        src={originalImageUrl}
                        alt="Original experiment document"
                        className="max-h-[500px] w-full rounded-xl border border-slate-200 bg-slate-50 object-contain"
                      />

                      <a
                        href={originalImageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-block text-sm font-semibold text-blue-600 hover:underline"
                      >
                        Open original image in new tab →
                      </a>
                    </div>
                  )}
                </section>

                <section>
                  <h4 className="mb-3 font-bold text-slate-900">
                    OCR Engine Results
                  </h4>

                  <div className="grid items-start gap-4 lg:grid-cols-2">
                    <EngineDetails
                      title="PaddleOCR"
                      color="blue"
                      result={selected.paddleocr_result}
                      accuracy={getEngineAccuracy(selected, "paddleocr")}
                    />

                    <EngineDetails
                      title="Tesseract"
                      color="violet"
                      result={selected.tesseract_result}
                      accuracy={getEngineAccuracy(selected, "tesseract")}
                    />
                  </div>
                </section>

                <p className="break-all text-[10px] text-slate-400">
                  Experiment ID: {selected.id}
                </p>
              </div>
            </section>
          </div>
        )}

        <footer className="pb-6 pt-2 text-center text-xs text-slate-400">
          OCR Comparison Workspace · Experiment History
        </footer>
      </div>
    </main>
  );
}
