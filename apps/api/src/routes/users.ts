import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, badRequest, notFound } from '../lib/http.js';
import { parse } from '../lib/validate.js';
import { hashPassword, requireAuth, requireRole } from '../lib/auth.js';

export const usersRouter = Router();

// The entire user-management surface is ADMIN-only.
usersRouter.use(requireAuth, requireRole('ADMIN'));

// Never return the password hash.
const publicUser = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;

const roleEnum = z.enum(['ADMIN', 'MANAGER', 'STAFF', 'DRIVER']);

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: roleEnum.default('STAFF'),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  role: roleEnum.optional(),
  isActive: z.boolean().optional(),
});

const passwordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

// GET /api/users
usersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const users = await prisma.user.findMany({
      where: { companyId: req.user!.companyId },
      select: publicUser,
      orderBy: { createdAt: 'asc' },
    });
    res.json(users);
  }),
);

// POST /api/users — invite/create a user into the admin's company
usersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { email, name, password, role } = parse(createSchema, req.body);
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name,
        role,
        passwordHash: await hashPassword(password),
        companyId: req.user!.companyId,
      },
      select: publicUser,
    });
    res.status(201).json(user);
  }),
);

/** Find a user that belongs to the caller's company, or throw 404. */
async function getCompanyUser(id: string, companyId: string) {
  const u = await prisma.user.findFirst({ where: { id, companyId }, select: { id: true } });
  if (!u) throw notFound('User not found');
  return u;
}

// PUT /api/users/:id — change name/role/active status
usersRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = parse(updateSchema, req.body);

    // Guard against self-lockout: an admin can't demote or deactivate themselves.
    if (req.params.id === req.user!.id) {
      if (data.role && data.role !== 'ADMIN') {
        throw badRequest('You cannot remove your own admin role');
      }
      if (data.isActive === false) {
        throw badRequest('You cannot deactivate your own account');
      }
    }

    await getCompanyUser(req.params.id, req.user!.companyId);

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: publicUser,
    });
    res.json(user);
  }),
);

// PATCH /api/users/:id/password — admin resets a user's password
usersRouter.patch(
  '/:id/password',
  asyncHandler(async (req, res) => {
    const { password } = parse(passwordSchema, req.body);
    await getCompanyUser(req.params.id, req.user!.companyId);
    await prisma.user.update({
      where: { id: req.params.id },
      data: { passwordHash: await hashPassword(password) },
    });
    res.status(204).end();
  }),
);
