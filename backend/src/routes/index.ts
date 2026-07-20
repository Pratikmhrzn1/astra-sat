import { Router } from 'express';
import authRouter from './auth';
import studentRouter from './student';
import teacherRouter from './teacher';
import adminRouter from './admin';
import feedbackRouter from './feedback';
import libraryRouter from './library';
import { liveExamRouter } from './liveExam';

const router = Router();

router.use('/auth', authRouter);
router.use('/student', studentRouter);
router.use('/teacher', teacherRouter);
router.use('/admin', adminRouter);
router.use('/feedback', feedbackRouter);
router.use('/library', libraryRouter);
router.use('/', liveExamRouter);

export default router;
