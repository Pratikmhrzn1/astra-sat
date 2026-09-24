import { Router } from 'express';
import { consoleRoutes } from './modules/admin';
import { insightsStudentRoutes } from './modules/analytics';
import { sittingsAdminRoutes, sittingsStudentRoutes } from './modules/attempts';
import { authoringAdminRoutes, authoringTeacherRoutes } from './modules/content';
import { accountRoutes, accountsAdminRoutes } from './modules/identity';
import { resourceRoutes } from './modules/library';
import { liveSessionRoutes } from './modules/live-exam';
import { notesStudentRoutes, notesTeacherRoutes } from './modules/messages';
import { misstepsStudentRoutes } from './modules/mistakes';
import { reportRoutes } from './modules/platform-feedback';
import { drillsStudentRoutes } from './modules/practice';
import { cohortTeacherRoutes } from './modules/roster';
import { competencyRoutes } from './modules/taxonomy';
import { intakeAdminRoutes, intakeStudentRoutes } from './modules/survey';
import { lexiconStudentRoutes, lexiconTeacherRoutes } from './modules/vocab';

/**
 * Everything under `/api`. Mount paths are part of the public contract the
 * frontend depends on, so they stay role-prefixed (/student, /teacher, /admin)
 * even though the code is organised by domain: several domain routers share
 * each prefix, and each applies its own role gate.
 *
 * No two routers under one prefix register the same method + path, so their
 * order does not decide which handler answers. `liveSessionRoutes` is mounted
 * last, at the root, because its paths (`/teacher/live-exams`, `/live/:code`,
 * `/student/...`) already encode their own audience.
 */
export const apiRoutes = Router();

apiRoutes.use('/auth', accountRoutes);

apiRoutes.use('/student', sittingsStudentRoutes);
apiRoutes.use('/student', drillsStudentRoutes);
apiRoutes.use('/student', misstepsStudentRoutes);
apiRoutes.use('/student', insightsStudentRoutes);
apiRoutes.use('/student', notesStudentRoutes);
apiRoutes.use('/student', lexiconStudentRoutes);
apiRoutes.use('/student', intakeStudentRoutes);

apiRoutes.use('/teacher', cohortTeacherRoutes);
apiRoutes.use('/teacher', notesTeacherRoutes);
apiRoutes.use('/teacher', authoringTeacherRoutes);
apiRoutes.use('/teacher', lexiconTeacherRoutes);

apiRoutes.use('/admin', consoleRoutes);
apiRoutes.use('/admin', accountsAdminRoutes);
apiRoutes.use('/admin', authoringAdminRoutes);
apiRoutes.use('/admin', sittingsAdminRoutes);
apiRoutes.use('/admin', intakeAdminRoutes);

apiRoutes.use('/feedback', reportRoutes);
apiRoutes.use('/library', resourceRoutes);
// Reference data, readable by every signed-in role rather than gated to one.
apiRoutes.use('/skills', competencyRoutes);

// Mounted last, at the root: its paths carry their own audience prefix.
apiRoutes.use('/', liveSessionRoutes);
