import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, conflict, unauthorized } from '../lib/http.js';
import { parse } from '../lib/validate.js';
import { hashPassword, requireAuth, signToken, verifyPassword, type AuthUser } from '../lib/auth.js';
import type { Role } from '../constants.js';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = parse(loginSchema, req.body);

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { company: { select: { name: true } } },
    });
    if (!user || !user.isActive) throw unauthorized('Invalid credentials');

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw unauthorized('Invalid credentials');

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as Role,
      companyId: user.companyId,
    };
    const token = signToken(authUser);
    res.json({ token, user: { ...authUser, companyName: user.company.name } });
  }),
);

// Public self-service: create a new company; the creator becomes its ADMIN.
const registerSchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  name: z.string().min(1, 'Your name is required'),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { companyName, name, email, password } = parse(registerSchema, req.body);
    const normalizedEmail = email.toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) throw conflict('That email is already registered');

    const passwordHash = await hashPassword(password);
    const user = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({ data: { name: companyName } });
      return tx.user.create({
        data: {
          email: normalizedEmail,
          name,
          passwordHash,
          role: 'ADMIN',
          companyId: company.id,
        },
      });
    });

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: 'ADMIN',
      companyId: user.companyId,
    };
    const token = signToken(authUser);
    res.status(201).json({ token, user: { ...authUser, companyName } });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const company = await prisma.company.findUnique({
      where: { id: req.user!.companyId },
      select: { name: true },
    });
    res.json({ user: { ...req.user, companyName: company?.name ?? null } });
  }),
);
