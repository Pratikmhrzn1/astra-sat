import { Router } from 'express';
import { authRouter } from './modules/auth/auth.routes';
import { studentRouter } from './modules/student/student.routes';
import { teacherRouter } from './modules/teacher/teacher.routes';
import { adminRouter } from './modules/admin/admin.routes';
import { platformFeedbackRouter } from './modules/platform-feedback/platform-feedback.routes';
import { libraryRouter } from './modules/library/library.routes';
import { skillsRouter } from './modules/skills/skills.routes';
import { liveExamRouter } from './modules/live-exam/live-exam.routes';

/**
 * Everything under `/api`. Mount paths are part of the public contract the
 * frontend depends on — `liveExamRouter` in particular is mounted at the root
 * because its paths (`/teacher/live-exams`, `/live/:code`, `/student/...`)
 * already encode their own audience.
 */
export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/student', studentRouter);
apiRouter.use('/teacher', teacherRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/feedback', platformFeedbackRouter);
apiRouter.use('/library', libraryRouter);
// Reference data, readable by every signed-in role rather than gated to one.
apiRouter.use('/skills', skillsRouter);

// Mounted last, at the root: its paths carry their own audience prefix.
apiRouter.use('/', liveExamRouter);
