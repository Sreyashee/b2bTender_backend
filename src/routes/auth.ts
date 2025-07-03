import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { supabase } from '../lib/supabase';
import jwt from 'jsonwebtoken';
import { verifyJWT, AuthRequest } from './authMiddleware';

import multer from 'multer';
import { createClient } from '@supabase/supabase-js';

const upload = multer({ storage: multer.memoryStorage() });

const supabaseStorage = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);


const router = Router();

interface SignupBody {
name: string;
  email: string;
  password: string;
  company_name: string;
  industry: string;
  industry_description: string;
}

interface UserResponse {
  id: string;
  name: string;
  email: string;

}

// Solution 1: The most TypeScript-friendly approach
const signupHandler = async (
  req: Request & { file?: Express.Multer.File },
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const {
      name,
      email,
      password,
      company_name,
      industry,
      industry_description,
    } = req.body;

    if (!name || !email || !password || !company_name || !industry || !industry_description) {
      res.status(400).json({
        error: 'ValidationError',
        message: 'All fields are required',
      });
      return;
    }

    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (checkError) throw checkError;
    if (existingUser) {
      res.status(409).json({
        error: 'UserExistsError',
        message: 'User with this email already exists',
      });
      return;
    }

    // Upload logo if file provided
    let logoUrl = '';
    if (req.file) {
      const fileExt = req.file.originalname.split('.').pop();
      const filePath = `logos/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabaseStorage.storage
        .from('logos')
        .upload(filePath, req.file.buffer, {
          contentType: req.file.mimetype,
        });

      if (uploadError) throw uploadError;

      const { data } = supabaseStorage.storage
        .from('logos')
        .getPublicUrl(filePath);
      logoUrl = data.publicUrl;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const { data: createdUser, error: insertError } = await supabase
      .from('users')
      .insert([
        {
          name,
          email,
          password: hashedPassword,
          company_name,
          industry,
          industry_description,
          logo: logoUrl,
        },
      ])
      .select()
      .single();

    if (insertError) throw insertError;

    res.status(201).json({
      success: true,
      data: {
        id: createdUser.id,
        name: createdUser.name,
        email: createdUser.email,
        company_name: createdUser.company_name,
        industry: createdUser.industry,
        industry_description: createdUser.industry_description,
        logo: createdUser.logo,
      },
    });
  }  catch (error: unknown) {
  if (error instanceof Error) {
    console.error('Signup Error:', error.message);
    res.status(500).json({
      error: 'ServerError',
      message: error.message,
    });
  } else {
    console.error('Signup Error:', error); // <== important fix!
    res.status(500).json({
      error: 'UnknownServerError',
      message: 'Something went wrong',
    });
  }
  next(error);
  }
};



// Register the route with proper typing
router.post(
  '/signup',
  upload.single('logo'),
  (req: Request, res: Response, next: NextFunction) => {
    void signupHandler(req as Request & { file?: Express.Multer.File }, res, next);
  }
);


interface LoginBody {
  email: string;
  password: string;
}

const loginHandler = async (
  req: Request<{}, {}, LoginBody>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        error: 'ValidationError',
        message: 'Email and password are required',
      });
      return;
    }

    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!user) {
      res.status(401).json({
        error: 'AuthError',
        message: 'Invalid email or password',
      });
      return;
    }

    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) {
      res.status(401).json({
        error: 'AuthError',
        message: 'Invalid email or password',
      });
      return;
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    );

    res.status(200).json({
      success: true,
      token,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('Login Error:', error.message);
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
// Login Route
router.post(
  '/login',
  (req: Request<{}, {}, LoginBody>, res: Response, next: NextFunction) => {
    void loginHandler(req, res, next);
  }
);



export default router;