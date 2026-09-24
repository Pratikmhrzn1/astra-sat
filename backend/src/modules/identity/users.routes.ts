import { Router } from 'express';
import { wrapAsync } from '../../core/http/async-handler';
import { sessionUserId, requireSession, requireAccountRole } from '../../core/http/middleware/auth';
import { validatedBody, checkBody } from '../../core/http/middleware/validate';
import { logAudit } from '../audit';
import * as service from './users.service';
import {
  assignStudentsSchema,
  createAccessCodeSchema,
  updateUserSchema,
  type AssignStudentsInput,
  type CreateAccessCodeInput,
  type UpdateUserInput,
} from './users.schemas';

/** Admin management of accounts and registration codes. */

export const usersAdminRouter = Router();

usersAdminRouter.use(requireSession, requireAccountRole(['admin']));

// ── Users ────────────────────────────────────────────────────────────────────

usersAdminRouter.get(
  '/users',
  wrapAsync(async (_req, res) => {
    res.json(await service.listUsers());
  }),
);

/** Bulk roster assignment. Registered before /users/:userId so it is not eaten by it. */
usersAdminRouter.put(
  '/users/assign-teacher',
  checkBody(assignStudentsSchema),
  wrapAsync(async (req, res) => {
    const input = validatedBody<AssignStudentsInput>(req);
    const result = await service.assignStudentsToTeacher(input);
    await logAudit({
      actorId: sessionUserId(req), action: 'users.assigned_teacher',
      targetType: 'user', targetId: input.teacherId ?? undefined,
      payload: { teacherId: input.teacherId, studentIds: input.studentIds, assigned: result.assigned },
    });
    res.json(result);
  }),
);

usersAdminRouter.put(
  '/users/:userId',
  checkBody(updateUserSchema),
  wrapAsync(async (req, res) => {
    const input = validatedBody<UpdateUserInput>(req);
    const updated = await service.updateUser(req.params.userId, input);
    await logAudit({
      actorId: sessionUserId(req), action: 'user.updated', targetType: 'user', targetId: req.params.userId,
      // Which fields changed, never their values: a password must not reach the log.
      payload: {
        fields: Object.keys(input).filter((k) => input[k as keyof UpdateUserInput] !== undefined),
        ...(input.teacherId !== undefined && { teacherId: input.teacherId }),
      },
    });
    res.json(updated);
  }),
);

usersAdminRouter.delete(
  '/users/:userId',
  wrapAsync(async (req, res) => {
    await service.deleteUser(req.params.userId, sessionUserId(req));
    await logAudit({ actorId: sessionUserId(req), action: 'user.deleted', targetType: 'user', targetId: req.params.userId });
    res.json({ ok: true });
  }),
);

// ── Access codes ─────────────────────────────────────────────────────────────

usersAdminRouter.get(
  '/access-codes',
  wrapAsync(async (_req, res) => {
    res.json(await service.listAccessCodes());
  }),
);

usersAdminRouter.post(
  '/access-codes',
  checkBody(createAccessCodeSchema),
  wrapAsync(async (req, res) => {
    const input = validatedBody<CreateAccessCodeInput>(req);
    const created = await service.createAccessCode(sessionUserId(req), input);
    await logAudit({
      actorId: sessionUserId(req), action: 'access_code.created', targetType: 'access_code', targetId: created?.id,
      // Not the code itself: it is a signup credential, and an admin code grants admin.
      payload: { role: input.role, maxUses: input.maxUses ?? null },
    });
    res.status(201).json(created);
  }),
);

usersAdminRouter.delete(
  '/access-codes/:codeId',
  wrapAsync(async (req, res) => {
    await service.deleteAccessCode(req.params.codeId);
    await logAudit({ actorId: sessionUserId(req), action: 'access_code.deleted', targetType: 'access_code', targetId: req.params.codeId });
    res.json({ ok: true });
  }),
);
