/**
 * The exam foundation every sitting builds on: creating an exam and its answer
 * sheet, server-side timing, grading, scaled scores, and question/exam reads.
 * Depends on core only — every exam-shaped module (attempts, practice,
 * mistakes, live-exam) sits on top of it.
 */
export * from './scaled-score';
export * from './exam-provisioning';
export * from './exam-timing';
export * from './grading';
export * as examRepository from './exam.repository';
