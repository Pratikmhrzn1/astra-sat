import { Router } from 'express';
import { authRouter } from './auth/auth.routes';
import { studentRouter } from './student/student.routes';

/**
 * Everything under `/api`. Mount paths are part of the public contract the
 * frontend depends on — `liveExamRouter` in particular is mounted at the root
 * because its paths (`/teacher/live-exams`, `/live/:code`, `/student/...`)
 * already encode their own audience.
 */
export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/student', studentRouter);
