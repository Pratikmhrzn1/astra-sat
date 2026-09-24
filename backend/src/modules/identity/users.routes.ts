import { Router } from 'express';
import { wrapAsync } from '../../core/http/async-handler';
import { sessionUserId, requireSession, requireAccountRole } from '../../core/http/middleware/auth';
import { validatedBody, checkBody } from '../../core/http/middleware/validate';
import { logTrail } from '../audit';
import * as service from './users.service';
import {
  assignStudentsRules,
  addAccessCodeRules,
  editUserRules,
  type AssignStudentsPayload,
  type CreateAccessCodePayload,
  type UpdateUserPayload,
} from './users.schemas';

/** Admin management of accounts and registration codes. */

export const accountsAdminRoutes = Router();

accountsAdminRoutes.use(requireSession, requireAccountRole(['admin']));

// ── Users ────────────────────────────────────────────────────────────────────

accountsAdminRoutes.get(
  '/users',
  wrapAsync(async (_req, res) => {
    res.json(await service.collectUsers());
  }),
);

/** Bulk roster assignment. Registered before /users/:userId so it is not eaten by it. */
accountsAdminRoutes.put(
  '/users/assign-teacher',
  checkBody(assignStudentsRules),
  wrapAsync(async (req, res) => {
    const input = validatedBody<AssignStudentsPayload>(req);
    const result = await service.linkLearnersToTeacher(input);
    await logTrail({
      actorId: sessionUserId(req), action: 'users.assigned_teacher',
      targetType: 'user', targetId: input.teacherId ?? undefined,
      payload: { teacherId: input.teacherId, studentIds: input.studentIds, assigned: result.assigned },
    });
    res.json(result);
  }),
);

accountsAdminRoutes.put(
  '/users/:userId',
  checkBody(editUserRules),
  wrapAsync(async (req, res) => {
    const input = validatedBody<UpdateUserPayload>(req);
    const updated = await service.editUser(req.params.userId, input);
    await logTrail({
      actorId: sessionUserId(req), action: 'user.updated', targetType: 'user', targetId: req.params.userId,
      // Which fields changed, never their values: a password must not reach the log.
      payload: {
        fields: Object.keys(input).filter((k) => input[k as keyof UpdateUserPayload] !== undefined),
        ...(input.teacherId !== undefined && { teacherId: input.teacherId }),
      },
    });
    res.json(updated);
  }),
);

accountsAdminRoutes.delete(
  '/users/:userId',
  wrapAsync(async (req, res) => {
    await service.removeUser(req.params.userId, sessionUserId(req));
    await logTrail({ actorId: sessionUserId(req), action: 'user.deleted', targetType: 'user', targetId: req.params.userId });
    res.json({ ok: true });
  }),
);

// ── Access codes ─────────────────────────────────────────────────────────────

accountsAdminRoutes.get(
  '/access-codes',
  wrapAsync(async (_req, res) => {
    res.json(await service.collectAccessCodes());
  }),
);

accountsAdminRoutes.post(
  '/access-codes',
  checkBody(addAccessCodeRules),
  wrapAsync(async (req, res) => {
    const input = validatedBody<CreateAccessCodePayload>(req);
    const created = await service.addAccessCode(sessionUserId(req), input);
    await logTrail({
      actorId: sessionUserId(req), action: 'access_code.created', targetType: 'access_code', targetId: created?.id,
      // Not the code itself: it is a signup credential, and an admin code grants admin.
      payload: { role: input.role, maxUses: input.maxUses ?? null },
    });
    res.status(201).json(created);
  }),
);

accountsAdminRoutes.delete(
  '/access-codes/:codeId',
  wrapAsync(async (req, res) => {
    await service.removeAccessCode(req.params.codeId);
    await logTrail({ actorId: sessionUserId(req), action: 'access_code.deleted', targetType: 'access_code', targetId: req.params.codeId });
    res.json({ ok: true });
  }),
);
