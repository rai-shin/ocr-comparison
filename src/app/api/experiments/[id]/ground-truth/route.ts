
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type AccuracyMetrics = {
  cer: number;
  wer: number;
  characterErrors: number;
  wordErrors: number;
  characterCount: number;
  wordCount: number;
  cerAccuracy: number;
  werAccuracy: number;
  calculatedAt: string;
};

function getObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function normalizeText(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

function levenshteinDistance(
  reference: string[],
  recognized: string[]
): number {
  if (reference.length === 0) return recognized.length;
  if (recognized.length === 0) return reference.length;

  let previous = Array.from(
    { length: recognized.length + 1 },
    (_, index) => index
  );

  for (let i = 1; i <= reference.length; i++) {
    const current = new Array<number>(recognized.length + 1);
    current[0] = i;

    for (let j = 1; j <= recognized.length; j++) {
      const substitutionCost =
        reference[i - 1] === recognized[j - 1] ? 0 : 1;

      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + substitutionCost
      );
    }

    previous = current;
  }

  return previous[recognized.length];
}

function calculateAccuracy(
  groundTruth: string,
  recognizedText: string
): AccuracyMetrics | null {
  const referenceText = normalizeText(groundTruth);
  const outputText = normalizeText(recognizedText);

  const referenceCharacters = Array.from(referenceText);
  const outputCharacters = Array.from(outputText);

  const referenceWords = referenceText
    ? referenceText.split(" ")
    : [];

  const outputWords = outputText
    ? outputText.split(" ")
    : [];

  if (referenceCharacters.length === 0 || referenceWords.length === 0) {
    return null;
  }

  const characterErrors = levenshteinDistance(
    referenceCharacters,
    outputCharacters
  );

  const wordErrors = levenshteinDistance(
    referenceWords,
    outputWords
  );

  const cer = (characterErrors / referenceCharacters.length) * 100;
  const wer = (wordErrors / referenceWords.length) * 100;

  return {
    cer,
    wer,
    characterErrors,
    wordErrors,
    characterCount: referenceCharacters.length,
    wordCount: referenceWords.length,
    cerAccuracy: Math.max(0, 100 - cer),
    werAccuracy: Math.max(0, 100 - wer),
    calculatedAt: new Date().toISOString(),
  };
}

function calculateEngineEvaluation(
  groundTruth: string,
  result: unknown
): AccuracyMetrics | null {
  const engineResult = getObject(result);

  if (typeof engineResult.text !== "string") {
    return null;
  }

  return calculateAccuracy(groundTruth, engineResult.text);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();

    // Verify the current Supabase session.
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "You must be logged in to save Ground Truth." },
        { status: 401 }
      );
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Experiment ID is required." },
        { status: 400 }
      );
    }

    const body = await request.json();

    if (
      !body ||
      typeof body.groundTruth !== "string" ||
      !body.groundTruth.trim()
    ) {
      return NextResponse.json(
        { error: "Please provide valid Ground Truth text." },
        { status: 400 }
      );
    }

    const groundTruth = body.groundTruth.trim();

    // Retrieve the experiment and its existing metrics.
    const { data: experiment, error: fetchError } = await supabase
      .from("experiments")
      .select("id, paddleocr_result, tesseract_result, metrics")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json(
        { error: fetchError.message },
        { status: 500 }
      );
    }

    if (!experiment) {
      return NextResponse.json(
        { error: "Experiment not found or access denied." },
        { status: 404 }
      );
    }

    const existingMetrics = getObject(experiment.metrics);

    const paddleMetrics = getObject(existingMetrics.paddleocr);
    const tesseractMetrics = getObject(existingMetrics.tesseract);

    // Calculate evaluation metrics for both OCR engines.
    const paddleEvaluation = calculateEngineEvaluation(
      groundTruth,
      experiment.paddleocr_result
    );

    const tesseractEvaluation = calculateEngineEvaluation(
      groundTruth,
      experiment.tesseract_result
    );

    // Preserve existing confidence and processing-time metrics.
    const updatedMetrics = {
      ...existingMetrics,
      paddleocr: {
        ...paddleMetrics,
        evaluation: paddleEvaluation,
      },
      tesseract: {
        ...tesseractMetrics,
        evaluation: tesseractEvaluation,
      },
    };

    // Save Ground Truth and evaluation metrics to Supabase.
    const { data: updatedExperiment, error: updateError } =
      await supabase
        .from("experiments")
        .update({
          ground_truth: groundTruth,
          metrics: updatedMetrics,
        })
        .eq("id", id)
        .select("id, ground_truth, metrics")
        .maybeSingle();

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    if (!updatedExperiment) {
      return NextResponse.json(
        { error: "Unable to update this experiment." },
        { status: 404 }
      );
    }

    // Return the fields expected by the History page.
    return NextResponse.json({
      success: true,
      message: "Ground Truth and evaluation metrics saved.",
      ground_truth: updatedExperiment.ground_truth,
      metrics: updatedExperiment.metrics,
    });
  } catch (error) {
    console.error("Ground Truth save error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred.",
      },
      { status: 500 }
    );
  }
}
