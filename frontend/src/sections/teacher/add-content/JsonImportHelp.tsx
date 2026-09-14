import { surfaceClass } from '@/components/common';
import { cn } from '@/lib/utils';

/** The bulk-import file format, shown from the "?" beside Upload JSON. */
export function JsonImportHelp() {
  return (
    <div className={cn(surfaceClass, 'px-[22px] py-[18px] mb-4')}>
      <h3 className="text-sm font-semibold mt-0 mb-2">Bulk import format</h3>
      <p className="text-[13px] text-subtle mt-0 mb-3 leading-[1.55]">
        An imported set arrives as a <strong>draft</strong> unless you pass <code>"isDraft": false</code>,
        so nothing reaches students before you have looked at it. Set <code>difficulty</code> is the
        adaptive tier (<code>low</code> / <code>medium</code> / <code>hard</code>) — without it the set is
        never picked for a mock module. Per-question <code>difficulty</code> is a different scale
        (<code>easy</code> / <code>medium</code> / <code>hard</code>) and drives topic practice.
        <code>skillCode</code> takes any domain or skill from the topic list, for both subjects.
      </p>
      <pre className="m-0 p-3.5 bg-[#F7F5F1] border border-border-soft rounded-[10px] text-xs leading-[1.6] overflow-x-auto font-mono">
{`{
  "title": "Algebra — Linear Equations",
  "subject": "math",
  "description": "Practice set",
  "difficulty": "medium",        // adaptive tier for the whole set
  "isDraft": false,              // omit to import as a draft
  "passages": [],                // English sets only
  "questions": [
    {
      "questionType": "multiple_choice",
      "questionText": "If 2x + 3 = 11, what is x?",
      "optionA": "2", "optionB": "3", "optionC": "4", "optionD": "5",
      "correctAnswer": "c",
      "explanation": "Subtract 3, then divide by 2.",
      "skillCode": "algebra",    // any code from the topic list
      "difficulty": "easy",      // this question, not the set
      "passageIndex": null       // index into "passages", or null
    }
  ]
}`}
      </pre>
    </div>
  );
}
