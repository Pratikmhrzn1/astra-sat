import { Router } from 'express';
import { asyncHandler } from '../../core/http/async-handler';
import { currentUserId, requireAuth, requireRole } from '../../core/http/middleware/auth';
import { body, validateBody } from '../../core/http/middleware/validate';
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

usersAdminRouter.use(requireAuth, requireRole(['admin']));

// ── Users ────────────────────────────────────────────────────────────────────

usersAdminRouter.get(
  '/users',
  asyncHandler(async (_req, res) => {
    res.json(await service.listUsers());
  }),
);

/** Bulk roster assignment. Registered before /users/:userId so it is not eaten by it. */
usersAdminRouter.put(
  '/users/assign-teacher',
  validateBody(assignStudentsSchema),
  asyncHandler(async (req, res) => {
    const input = body<AssignStudentsInput>(req);
    const result = await service.assignStudentsToTeacher(input);
    await logAudit({
      actorId: currentUserId(req), action: 'users.assigned_teacher',
      targetType: 'user', targetId: input.teacherId ?? undefined,
      payload: { teacherId: input.teacherId, studentIds: input.studentIds, assigned: result.assigned },
    });
    res.json(result);
  }),
);

usersAdminRouter.put(
  '/users/:userId',
  validateBody(updateUserSchema),
  asyncHandler(async (req, res) => {
    const input = body<UpdateUserInput>(req);
    const updated = await service.updateUser(req.params.userId, input);
    await logAudit({
      actorId: currentUserId(req), action: 'user.updated', targetType: 'user', targetId: req.params.userId,
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
  asyncHandler(async (req, res) => {
    await service.deleteUser(req.params.userId, currentUserId(req));
    await logAudit({ actorId: currentUserId(req), action: 'user.deleted', targetType: 'user', targetId: req.params.userId });
    res.json({ ok: true });
  }),
);

// ── Access codes ─────────────────────────────────────────────────────────────

usersAdminRouter.get(
  '/access-codes',
  asyncHandler(async (_req, res) => {
    res.json(await service.listAccessCodes());
  }),
);

usersAdminRouter.post(
  '/access-codes',
  validateBody(createAccessCodeSchema),
  asyncHandler(async (req, res) => {
    const input = body<CreateAccessCodeInput>(req);
    const created = await service.createAccessCode(currentUserId(req), input);
    await logAudit({
      actorId: currentUserId(req), action: 'access_code.created', targetType: 'access_code', targetId: created?.id,
      // Not the code itself: it is a signup credential, and an admin code grants admin.
      payload: { role: input.role, maxUses: input.maxUses ?? null },
    });
    res.status(201).json(created);
  }),
);

usersAdminRouter.delete(
  '/access-codes/:codeId',
  asyncHandler(async (req, res) => {
    await service.deleteAccessCode(req.params.codeId);
    await logAudit({ actorId: currentUserId(req), action: 'access_code.deleted', targetType: 'access_code', targetId: req.params.codeId });
    res.json({ ok: true });
  }),
);
