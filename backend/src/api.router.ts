import { Router } from 'express';
import { adminRouter } from './modules/admin';
import { analyticsStudentRouter } from './modules/analytics';
import { attemptsAdminRouter, attemptsStudentRouter } from './modules/attempts';
import { contentAdminRouter, contentTeacherRouter } from './modules/content';
import { authRouter, usersAdminRouter } from './modules/identity';
import { libraryRouter } from './modules/library';
import { liveExamRouter } from './modules/live-exam';
import { messagesStudentRouter, messagesTeacherRouter } from './modules/messages';
import { mistakesStudentRouter } from './modules/mistakes';
import { platformFeedbackRouter } from './modules/platform-feedback';
import { practiceStudentRouter } from './modules/practice';
import { rosterTeacherRouter } from './modules/roster';
import { skillsRouter } from './modules/taxonomy';
import { vocabStudentRouter, vocabTeacherRouter } from './modules/vocab';

/**
 * Everything under `/api`. Mount paths are part of the public contract the
 * frontend depends on, so they stay role-prefixed (/student, /teacher, /admin)
 * even though the code is organised by domain: several domain routers share
 * each prefix, and each applies its own role gate.
 *
 * No two routers under one prefix register the same method + path, so their
 * order does not decide which handler answers. `liveExamRouter` is mounted
 * last, at the root, because its paths (`/teacher/live-exams`, `/live/:code`,
 * `/student/...`) already encode their own audience.
 */
export const apiRouter = Router();

apiRouter.use('/auth', authRouter);

apiRouter.use('/student', attemptsStudentRouter);
apiRouter.use('/student', practiceStudentRouter);
apiRouter.use('/student', mistakesStudentRouter);
apiRouter.use('/student', analyticsStudentRouter);
apiRouter.use('/student', messagesStudentRouter);
apiRouter.use('/student', vocabStudentRouter);

apiRouter.use('/teacher', rosterTeacherRouter);
apiRouter.use('/teacher', messagesTeacherRouter);
apiRouter.use('/teacher', contentTeacherRouter);
apiRouter.use('/teacher', vocabTeacherRouter);

apiRouter.use('/admin', adminRouter);
apiRouter.use('/admin', usersAdminRouter);
apiRouter.use('/admin', contentAdminRouter);
apiRouter.use('/admin', attemptsAdminRouter);

apiRouter.use('/feedback', platformFeedbackRouter);
apiRouter.use('/library', libraryRouter);
// Reference data, readable by every signed-in role rather than gated to one.
apiRouter.use('/skills', skillsRouter);

// Mounted last, at the root: its paths carry their own audience prefix.
apiRouter.use('/', liveExamRouter);
