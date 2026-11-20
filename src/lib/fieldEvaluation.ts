
import schema from "./health_record_fields.json";

type Field = {
  id: string;
  label: string;
  type: string;
};

type Section = {
  id: string;
  name: string;
  fields: Field[];
};

type FieldResult = {
  id: string;
  section: string;
  label: string;
  expected: string;
  actual: string;
  status: "correct" | "incorrect" | "missing" | "unverifiable";
};

type EvaluationResult = {
  total: number;
  correct: number;
  incorrect: number;
  missing: number;
  unverifiable: number;
  accuracy: number | null;
  coverage: number;
  correctPercentage: number;
  incorrectPercentage: number;
  missingPercentage: number;
  unverifiablePercentage: number;
  details: FieldResult[];
};

const sections = (schema as { sections: Section[] }).sections;

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function editDistance(a: string, b: string): number {
  const matrix = Array.from(
    { length: a.length + 1 },
    () => Array(b.length + 1).fill(0)
  );

  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] +
          (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }

  return matrix[a.length][b.length];
}

function labelsMatch(candidate: string, label: string): boolean {
  const a = normalize(candidate);
  const b = normalize(label);

  if (!a || !b) return false;
  if (a === b) return true;

  const distance = editDistance(a, b);
  const similarity = 1 - distance / Math.max(a.length, b.length);

  return (
    Math.min(a.length, b.length) >= 4 &&
    similarity >= 0.82
  );
}

function aliasesFor(field: Field): string[] {
  const aliases: Record<string, string[]> = {
    student_contact: ["Contact No", "Contact Number"],
    spouse_contact: ["Contact No", "Contact Number"],
    mother_contact: ["Contact No", "Contact Number"],
    father_contact: ["Contact No", "Contact Number"],

    spouse_name: ["Spouse Name if Married"],

    mother_guardian_name: [
      "Mother Guardian Name",
      "Mother Guardian's Name",
    ],

    father_name: ["Father's Name"],

    student_address: ["Address"],
    spouse_address: ["Address"],
    mother_address: ["Address"],
    father_address: ["Address"],

    student_age: ["Age"],
    student_birthday: ["Birthday"],
    student_birthplace: ["Birthplace"],
    student_nationality: ["Nationality"],
    student_religion: ["Religion"],

    college_level_block: [
      "Level and Block",
      "Level Block",
      "Level & Bloc",
    ],

    college_course: ["College Course"],
    shs_grade_level: ["SHS Grade Level"],
    shs_section: ["SHS Section", "Section"],

    hospitalization_reason: ["Reason"],
    surgery_reason: ["Reason"],

    special_medication_drugs: ["What Drugs"],

    regular_cycle_days: [
      "Regular Days",
      "Regular Cycle Days",
    ],

    irregular_cycle_days: [
      "Irregular Days",
      "Irregular Cycle Days",
    ],

    student_certification_date: ["Date"],
    examination_date: ["Date"],
  };

  return Array.from(
    new Set([field.label, ...(aliases[field.id] ?? [])])
  );
}

function headingAliases(section: Section): string[] {
  const headings: Record<string, string[]> = {
    student_information: ["PART 1", "STUDENT PARENT"],

    medical_history: ["A MEDICAL HISTORY"],

    family_medical_history: ["B FAMILY HISTORY"],

    student_experiences: [
      "C HAS THE STUDENT EXPERIENCED",
      "HAS THE STUDENT EXPERIENCED",
    ],

    for_boys: ["D FOR BOYS"],

    for_girls: ["FOR GIRLS"],

    personal_social_history: ["E PSYCHOSOCIAL HISTORY"],

    abuse_details: ["EXPERIENCED ABUSE"],

    physical_examination: ["PHYSICAL EXAMINATION"],

    fitness_certification: ["FITNESS CERTIFICATION"],

    physician_findings: ["IMPRESSIONS"],

    physician_details: ["SCHOOL PHYSICIAN"],

    student_certification: ["STUDENT SIGNATURE"],
  };

  return headings[section.id] ?? [section.name];
}

/**
 * Finds a phrase in the original text while ignoring differences
 * in punctuation and repeated whitespace.
 *
 * Returns original-text character positions.
 */
function findPhrasePosition(
  text: string,
  phrase: string,
  searchFrom = 0
): number {
  const tokens = Array.from(
    text.matchAll(/[A-Za-z0-9]+/g)
  );

  const phraseTokens = normalize(phrase).split(" ");

  if (!phraseTokens.length || !phraseTokens[0]) {
    return -1;
  }

  for (
    let i = 0;
    i <= tokens.length - phraseTokens.length;
    i++
  ) {
    const first = tokens[i];

    if (first.index === undefined || first.index < searchFrom) {
      continue;
    }

    const candidate = tokens
      .slice(i, i + phraseTokens.length)
      .map((token) => token[0])
      .join(" ");

    if (normalize(candidate) === phraseTokens.join(" ")) {
      return first.index;
    }
  }

  return -1;
}

function findSectionRange(
  text: string,
  section: Section
): { start: number; end: number } {
  if (section.id === "student_information") {
    const medicalStart = findPhrasePosition(
      text,
      "A MEDICAL HISTORY"
    );

    return {
      start: 0,
      end: medicalStart >= 0 ? medicalStart : text.length,
    };
  }

  let start = -1;

  for (const alias of headingAliases(section)) {
    const index = findPhrasePosition(text, alias);

    if (index >= 0 && (start === -1 || index < start)) {
      start = index;
    }
  }

  if (start === -1) {
    return { start: 0, end: text.length };
  }

  let end = text.length;

  for (const other of sections) {
    if (
      other.id === section.id ||
      other.id === "student_information"
    ) {
      continue;
    }

    for (const alias of headingAliases(other)) {
      const index = findPhrasePosition(text, alias, start + 1);

      if (index >= 0 && index < end) {
        end = index;
      }
    }
  }

  return { start, end };
}

type LabelOccurrence = {
  start: number;
  end: number;
  field: Field;
};

type TextToken = {
  text: string;
  start: number;
  end: number;
};

/**
 * Tokenizes text while preserving the original character positions.
 */
function tokenize(text: string): TextToken[] {
  const tokens: TextToken[] = [];

  const pattern = /[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*/g;

  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    tokens.push({
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return tokens;
}

/**
 * Finds all recognized field labels.
 *
 * The token positions refer to the original text, so labels
 * on the same line and labels with punctuation are supported.
 */
function findLabelOccurrences(
  text: string,
  fields: Field[]
): LabelOccurrence[] {
  const tokens = tokenize(text);

  const candidates: LabelOccurrence[] = [];

  for (const field of fields) {
    for (const alias of aliasesFor(field)) {
      const aliasWords = normalize(alias).split(" ");

      if (!aliasWords.length || !aliasWords[0]) {
        continue;
      }

      for (
        let i = 0;
        i <= tokens.length - aliasWords.length;
        i++
      ) {
        const matchedTokens = tokens.slice(
          i,
          i + aliasWords.length
        );

        const candidate = matchedTokens
          .map((token) => token.text)
          .join(" ");

        if (!labelsMatch(candidate, alias)) {
          continue;
        }

        const start = matchedTokens[0].start;
        const end = matchedTokens[matchedTokens.length - 1].end;

        candidates.push({
          start,
          end,
          field,
        });
      }
    }
  }

  // Sort by position, preferring longer label matches.
  candidates.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;

    return (b.end - b.start) - (a.end - a.start);
  });

  // Resolve overlapping matches at the same position.
  const selected: LabelOccurrence[] = [];

  for (const candidate of candidates) {
    const overlaps = selected.some(
      (existing) =>
        candidate.start < existing.end &&
        candidate.end > existing.start
    );

    if (!overlaps) {
      selected.push(candidate);
    }
  }

  // Repeated generic labels need to be assigned in schema order.
  const fieldsByLabel = new Map<string, Field[]>();

  for (const field of fields) {
    for (const alias of aliasesFor(field)) {
      const key = normalize(alias);

      if (!fieldsByLabel.has(key)) {
        fieldsByLabel.set(key, []);
      }

      const list = fieldsByLabel.get(key)!;

      if (!list.some((item) => item.id === field.id)) {
        list.push(field);
      }
    }
  }

  const occurrencesByPosition = new Map<
    string,
    LabelOccurrence[]
  >();

  for (const occurrence of selected) {
    const key = `${occurrence.start}:${occurrence.end}`;

    if (!occurrencesByPosition.has(key)) {
      occurrencesByPosition.set(key, []);
    }

    occurrencesByPosition.get(key)!.push(occurrence);
  }

  // Preserve unique matches. Repeated generic labels are resolved
  // using the order in which their fields appear in the schema.
  const result: LabelOccurrence[] = [];
  const repeatedCounters = new Map<string, number>();

  for (const occurrence of selected) {
    const matchingAliases = aliasesFor(occurrence.field);

    const genericAlias = matchingAliases.find((alias) => {
      const key = normalize(alias);
      return (fieldsByLabel.get(key)?.length ?? 0) > 1;
    });

    if (!genericAlias) {
      result.push(occurrence);
      continue;
    }

    const key = normalize(genericAlias);
    const group = fieldsByLabel.get(key) ?? [];

    const counter = repeatedCounters.get(key) ?? 0;

    const assignedField = group[counter];

    if (assignedField) {
      result.push({
        ...occurrence,
        field: assignedField,
      });

      repeatedCounters.set(key, counter + 1);
    }
  }

  return result.sort(
    (a, b) => a.start - b.start || a.end - b.end
  );
}

function cleanValue(value: string): string {
  return value
    .replace(/^[\s:|–—-]+/, "")
    .replace(/[\s|–—-]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts values between recognized labels.
 *
 * Example:
 *   Name: Lorein Age: 18
 *
 * Result:
 *   Name = Lorein
 *   Age = 18
 *
 * Example:
 *   Name: Age:
 *
 * Result:
 *   Name = ""
 *   Age = ""
 */
function extractFieldValues(
  text: string,
  section: Section
): Map<string, string> {
  const range = findSectionRange(text, section);

  const sectionText = text.slice(range.start, range.end);

  const occurrences = findLabelOccurrences(
    sectionText,
    section.fields
  );

  const values = new Map<string, string>();

  for (let i = 0; i < occurrences.length; i++) {
    const current = occurrences[i];
    const next = occurrences[i + 1];

    const valueStart = current.end;

    const valueEnd = next
      ? next.start
      : sectionText.length;

    const rawValue = sectionText.slice(
      valueStart,
      valueEnd
    );

    const value = cleanValue(rawValue);

    // Do not overwrite a nonblank value with an empty duplicate.
    if (!values.has(current.field.id) || value) {
      values.set(current.field.id, value);
    }
  }

  return values;
}

function normalizeValue(value: string): string {
  return normalize(value)
    .replace(/\b(street|st)\b/g, "st")
    .replace(/\b(brgy|barangay)\b/g, "barangay")
    .replace(/\b(number|no)\b/g, "number")
    .trim();
}

function valuesMatch(
  expected: string,
  actual: string
): boolean {
  const a = normalizeValue(expected);
  const b = normalizeValue(actual);

  if (!a || !b) return false;

  if (a === b) return true;

  // Permit punctuation and harmless formatting differences.
  return a.replace(/\s/g, "") === b.replace(/\s/g, "");
}

function calculateSummary(
  details: FieldResult[]
): EvaluationResult {
  const correct = details.filter(
    (item) => item.status === "correct"
  ).length;

  const incorrect = details.filter(
    (item) => item.status === "incorrect"
  ).length;

  const missing = details.filter(
    (item) => item.status === "missing"
  ).length;

  const unverifiable = details.filter(
    (item) => item.status === "unverifiable"
  ).length;

  const total = details.length;

  const percentage = (count: number) =>
    total > 0 ? (count / total) * 100 : 0;

  return {
    total,
    correct,
    incorrect,
    missing,
    unverifiable,

    // All nonblank Ground Truth fields are included.
    accuracy: total > 0 ? (correct / total) * 100 : null,

    coverage:
      total > 0
        ? ((correct + incorrect) / total) * 100
        : 0,

    correctPercentage: percentage(correct),
    incorrectPercentage: percentage(incorrect),
    missingPercentage: percentage(missing),
    unverifiablePercentage: percentage(unverifiable),

    details,
  };
}

// Full-document raw OCR evaluation.
export function evaluateDocumentFields(
  groundTruth: string,
  ocrText: string,
  sectionIds?: string[]
): EvaluationResult {
  const details: FieldResult[] = [];

  for (const section of sections) {
    if (sectionIds && !sectionIds.includes(section.id)) {
      continue;
    }

    const expectedValues = extractFieldValues(
      groundTruth,
      section
    );

    const actualValues = extractFieldValues(
      ocrText,
      section
    );

    for (const field of section.fields) {
      const expected = expectedValues.get(field.id) ?? "";

      // Only nonblank Ground Truth fields are evaluated.
      if (!expected) continue;

      const actual = actualValues.get(field.id) ?? "";

      let status: FieldResult["status"];

      if (!actual) {
        status = "missing";
      } else if (valuesMatch(expected, actual)) {
        status = "correct";
      } else {
        status = "incorrect";
      }

      details.push({
        id: field.id,
        section: section.name,
        label: field.label,
        expected,
        actual,
        status,
      });
    }
  }

  return calculateSummary(details);
}

// Structured-data evaluation remains separate.
export function evaluateStructuredFields(
  groundTruth: string,
  structuredData: unknown
): EvaluationResult {
  const root = getRecord(structuredData);

  const outer = getRecord(root.structured_data);

  const data =
    Object.keys(outer).length > 0 ? outer : root;

  const sectionMappings: Record<string, string> = {
    medical_history: "medical_history",
    family_history: "family_medical_history",
    student_experiences: "student_experiences",
    circumcision: "for_boys",
    psychosocial_history: "personal_social_history",
    for_girls: "for_girls",
  };

  const details: FieldResult[] = [];

  for (const [dataKey, schemaSectionId] of Object.entries(
    sectionMappings
  )) {
    const section = sections.find(
      (item) => item.id === schemaSectionId
    );

    if (!section) continue;

    const sectionData = data[dataKey];

    if (!sectionData) continue;

    const extractedById = new Map<string, string>();
    const extractedByLabel = new Map<string, string>();

    if (Array.isArray(sectionData)) {
      for (const row of sectionData) {
        const item = getRecord(row);

        const id =
          typeof item.id === "string" ? item.id : "";

        const label =
          typeof item.label === "string" ? item.label : "";

        const response =
          typeof item.response === "string"
            ? item.response
            : "";

        if (id && response) {
          extractedById.set(id, response);
        }

        if (label && response) {
          extractedByLabel.set(
            normalize(label),
            response
          );
        }
      }
    } else if (dataKey === "for_girls") {
      const girls = getRecord(sectionData);

      const girlsLabels: Record<string, string> = {
        age_of_menarche: "Age of Menarche",
        last_menstrual_period: "Last Menstrual Period",
        regular_cycle_days: "Regular Cycle Days",
        irregular_cycle_days: "Irregular Cycle Days",
        menstrual_cycle: "Cycle",
        menstrual_flow: "Flow",
      };

      for (const [key, label] of Object.entries(girlsLabels)) {
        const rawValue = girls[key];

        const valueObject = getRecord(rawValue);

        const value = valueObject.value ?? rawValue;

        if (
          typeof value === "string" ||
          typeof value === "number"
        ) {
          extractedByLabel.set(
            normalize(label),
            String(value)
          );
        }
      }
    }

    const expectedValues = extractFieldValues(
      groundTruth,
      section
    );

    for (const field of section.fields) {
      const expected = expectedValues.get(field.id) ?? "";

      if (!expected) continue;

      const actual =
        extractedById.get(field.id) ??
        extractedByLabel.get(normalize(field.label)) ??
        "";

      let status: FieldResult["status"];

      if (
        actual === "NEEDS_REVIEW" ||
        actual === "UNMARKED"
      ) {
        status = "unverifiable";
      } else if (!actual) {
        status = "missing";
      } else if (valuesMatch(expected, actual)) {
        status = "correct";
      } else {
        status = "incorrect";
      }

      details.push({
        id: field.id,
        section: section.name,
        label: field.label,
        expected,
        actual,
        status,
      });
    }
  }

  return calculateSummary(details);
}

function getRecord(
  value: unknown
): Record<string, unknown> {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value as Record<string, unknown>;
  }

  return {};
}
