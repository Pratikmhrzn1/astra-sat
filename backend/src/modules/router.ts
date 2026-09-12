import { Router } from 'express';
import { authRouter } from './auth/auth.routes';
import { studentRouter } from './student/student.routes';
import { teacherRouter } from './teacher/teacher.routes';
import { adminRouter } from './admin/admin.routes';
import { platformFeedbackRouter } from './platform-feedback/platform-feedback.routes';
import { libraryRouter } from './library/library.routes';
import { skillsRouter } from './skills/skills.routes';
import { liveExamRouter } from './live-exam/live-exam.routes';

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
