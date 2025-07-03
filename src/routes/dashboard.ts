import { Router, Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase';
import { verifyJWT, AuthRequest } from './authMiddleware';

const router = Router();

const meHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { userId } = req.user!;

    const { data: user, error } = await supabase
      .from('users')
      .select('id, name, email, company_name, industry, industry_description, logo')
      .eq('id', userId)
      .maybeSingle();

    if (error || !user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.status(200).json({
      success: true,
      user,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('Me Error:', error.message);
      res.status(500).json({
        error: 'ServerError',
        message: 'An unexpected error occurred',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
      return;
    }
    next(error);
  }
};

// Register the /me route using same structure
router.get(
    '/me',
    verifyJWT,
    (req: Request, res: Response, next: NextFunction) => {
        void meHandler(req as AuthRequest, res, next);
    }
);

export default router;
