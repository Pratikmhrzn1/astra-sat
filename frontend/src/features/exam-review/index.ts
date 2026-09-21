/** Public API of the exam-review feature. Pages are loaded by the router directly. */
export * from './api';
/** Shared with the teacher's read of a student's paper, so the two cannot drift. */
export { PassageBlock, QuestionImage } from './components/PassageBlock';
