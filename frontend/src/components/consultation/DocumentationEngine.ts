/**
 * Clinical Documentation Engine — Milestone 16A
 *
 * Pure TypeScript module with no React or API dependencies. Accepts a structured
 * input snapshot and produces a formatted consultation note string. Designed to
 * be reusable across Teleconsultation, Facility Consultation, and future modules.
 *
 * Extend NoteInput with additional fields as new modules add clinical data.
 * The output format is plain text — easy to copy, print, or embed in PDFs.
 */

export interface NotePatient {
  fullName: string | null;
  uhid: string | null;
  age: number | null;
  gender: string | null;
  phone: string | null;
  assignedWorker: string | null;
}

export interface NoteClinicalContext {
  program: string | null;
  condition: string | null;
  activity: string | null;
  enrollmentStatus: string | null;
}

export interface NoteOutcome {
  name: string;
  category: string;
}

/** One counselling section's selected item texts, for note generation (16B+). */
export interface NoteCounsellingSection {
  name: string;
  /** The noteText values of all selected items in this section. */
  selectedItems: string[];
}

export interface NoteInput {
  patient: NotePatient;
  clinicalContext: NoteClinicalContext;
  /** The selected consultation outcome. Null when no outcome selected yet. */
  outcome: NoteOutcome | null;
  /** Structured field values keyed by field label (from DynamicClinicalForm). */
  clinicalData: Record<string, unknown>;
  /** Free-text clinical observations. */
  clinicalNotes: string;
  /** Additional remarks or follow-up notes. */
  remarks: string;
  /**
   * Counselling sections with their selected items (16B+).
   * When present, a COUNSELLING PROVIDED block is rendered in the note.
   * Sections with no selected items are omitted.
   */
  counsellingSections?: NoteCounsellingSection[];
}

const SECTION = '─'.repeat(22);

function line(label: string, value: string | null | undefined): string {
  return `${label.padEnd(14)}: ${value ?? '—'}`;
}

/**
 * Generates a structured consultation note from form state.
 * Returns a deterministic plain-text string — same input always produces the
 * same output, making diffs predictable for version tracking.
 */
export function generateConsultationNote(input: NoteInput): string {
  const {
    patient: p, clinicalContext: cc, outcome, clinicalData,
    clinicalNotes, remarks, counsellingSections,
  } = input;

  const today = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const parts: string[] = [];

  parts.push('CLINICAL CONSULTATION NOTE');
  parts.push(SECTION);
  parts.push(line('Date', today));
  parts.push('');

  parts.push('PATIENT');
  parts.push(line('Name', p.fullName));
  parts.push(line('UHID', p.uhid));
  parts.push(line('Age / Sex', `${p.age ?? '—'} / ${p.gender ?? '—'}`));
  parts.push(line('Phone', p.phone));
  if (p.assignedWorker) parts.push(line('Worker', p.assignedWorker));
  parts.push('');

  parts.push('CLINICAL CONTEXT');
  parts.push(line('Program', cc.program));
  parts.push(line('Condition', cc.condition));
  parts.push(line('Activity', cc.activity));
  parts.push(line('Enr. Status', cc.enrollmentStatus));
  parts.push('');

  if (outcome) {
    parts.push('CONSULTATION OUTCOME');
    parts.push(line('Outcome', outcome.name));
    parts.push(line('Category', outcome.category));
    parts.push('');
  }

  // 16B: counselling items drive the note. 16A-legacy: form fields used instead.
  const activeCounselling = (counsellingSections ?? []).filter(
    (s) => s.selectedItems.length > 0,
  );
  if (activeCounselling.length > 0) {
    parts.push('COUNSELLING PROVIDED');
    for (const section of activeCounselling) {
      parts.push('');
      parts.push(section.name.toUpperCase());
      for (const item of section.selectedItems) {
        parts.push(`  • ${item}`);
      }
    }
    parts.push('');
  } else {
    // Legacy path: render form fields when no counselling selections exist.
    const fieldEntries = Object.entries(clinicalData).filter(
      ([k, v]) => k !== 'selectedItemIds' && v !== undefined && v !== null && String(v).trim() !== '',
    );
    if (fieldEntries.length > 0) {
      parts.push('STRUCTURED ASSESSMENT');
      for (const [label, val] of fieldEntries) {
        parts.push(line(label, String(val)));
      }
      parts.push('');
    }
  }

  if (clinicalNotes.trim()) {
    parts.push('CLINICAL NOTES');
    parts.push(clinicalNotes.trim());
    parts.push('');
  }

  if (remarks.trim()) {
    parts.push('REMARKS');
    parts.push(remarks.trim());
    parts.push('');
  }

  // Trailing newline stripped so textarea line-count stays predictable.
  return parts.join('\n').trimEnd();
}
