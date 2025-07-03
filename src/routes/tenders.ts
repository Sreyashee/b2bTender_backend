import { Router, Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase';
import { verifyJWT, AuthRequest } from './authMiddleware';

const router = Router();

interface TenderBody {
  title: string;
  description: string;
  budget: number;
  deadline: string; // YYYY-MM-DD
}

const createTenderHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { title, description, budget, deadline } = req.body;

    if (!title || !description || !budget || !deadline) {
      res.status(400).json({ message: 'All fields are required' });
      return;
    }

    const creator_id = req.user?.userId;

    const { data, error } = await supabase.from('tenders').insert([
      {
        title,
        description,
        budget,
        deadline,
        creator_id,
      },
    ]);

    if (error) throw error;

    res.status(201).json({ success: true, message: 'Tender created' });
  } catch (err: any) {
    console.error('Tender Create Error:', err.message);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
};

router.post(
  '/',
  verifyJWT,
  (req: Request, res: Response, next: NextFunction) => {
    void createTenderHandler(req as AuthRequest, res, next);
  }
);

router.get(
  '/my',
  verifyJWT,
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as AuthRequest).user?.userId;

    try {
      const { data, error } = await supabase
        .from('tenders')
        .select('*')
        .eq('creator_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      res.status(200).json({ success: true, tenders: data });
    } catch (err: any) {
      console.error('Get My Tenders Error:', err.message);
      res.status(500).json({ error: 'ServerError', message: err.message });
    }
  }
);
router.get(
  '/others',
  verifyJWT,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as AuthRequest).user?.userId;

      const { data, error } = await supabase
        .from('tenders')
        .select('*')
        .neq('creator_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Fetch others error:', error.message);
        res.status(500).json({ message: error.message });
        return;
      }

      res.json({ tenders: data });
    } catch (err: any) {
      next(err);
    }
  }
);
router.post('/:id/apply', verifyJWT, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const applicant_id = (req as AuthRequest).user?.userId;
    const tender_id = req.params.id;
    const { proposal_text } = req.body;

    if (!proposal_text || !tender_id || !applicant_id) {
      res.status(400).json({ message: 'Missing required fields' });
      return;
    }

    const { error } = await supabase.from('applications').insert([
      {
        tender_id,
        applicant_id,
        proposal_text,
      },
    ]);

    if (error) {
      console.error('Apply error:', error.message);
      res.status(500).json({ message: error.message });
      return;
    }

    res.status(201).json({ message: 'Application submitted successfully' });
  } catch (err) {
    next(err);
  }
});

router.get(
  '/:id/applications',
  verifyJWT,
  async (req: Request, res: Response): Promise<void> => {
    const tender_id = req.params.id;
    const requester_id = (req as AuthRequest).user?.userId;

    // Verify that the requester is the owner of the tender
    const { data: tender, error: tenderError } = await supabase
      .from('tenders')
      .select('creator_id')
      .eq('id', tender_id)
      .maybeSingle();

    if (tenderError || !tender) {
      res.status(403).json({ message: 'Tender not found or unauthorized' });
      return;
    }

    if (tender.creator_id !== requester_id) {
      res.status(403).json({ message: 'Access denied' });
      return;
    }

    const { data: applications, error } = await supabase
      .from('applications')
      .select('id, proposal_text, applicant_id, created_at')
      .eq('tender_id', tender_id)
      .order('created_at', { ascending: false });

    if (error) {
      res.status(500).json({ message: error.message });
      return;
    }

    res.json({ applications });
  }
);
router.patch(
  '/applications/:id/status',
  verifyJWT,
  async (req: Request, res: Response) => {
    const appId = req.params.id;
    const { status } = req.body;
    const userId = (req as AuthRequest).user?.userId;

    if (!['accepted', 'rejected'].includes(status)) {
      res.status(400).json({ message: 'Invalid status' });
      return;
    }

    // Check if user owns the tender for this application
    const { data: appRecord, error: fetchError } = await supabase
      .from('applications')
      .select('tender_id')
      .eq('id', appId)
      .maybeSingle();

    if (fetchError || !appRecord) {
      res.status(404).json({ message: 'Application not found' });
      return;
    }

    const { data: tender, error: tenderError } = await supabase
      .from('tenders')
      .select('creator_id')
      .eq('id', appRecord.tender_id)
      .maybeSingle();

    if (tenderError || !tender || tender.creator_id !== userId) {
      res.status(403).json({ message: 'Unauthorized' });
      return;
    }

    const { error: updateError } = await supabase
      .from('applications')
      .update({ status })
      .eq('id', appId);

    if (updateError) {
      res.status(500).json({ message: updateError.message });
      return;
    }

    res.json({ success: true, message: `Application ${status}` });
  }
);
router.get(
  '/my-applications',
  verifyJWT,
  async (req: Request, res: Response): Promise<void> => {
    const applicant_id = (req as AuthRequest).user?.userId;

    const { data, error } = await supabase
      .from('applications')
      .select(`
        id,
        proposal_text,
        status,
        created_at,
        tender_id,
        tenders(title, deadline)
      `)
      .eq('applicant_id', applicant_id)
      .order('created_at', { ascending: false });

    if (error) {
      res.status(500).json({ message: error.message });
      return;
    }

    res.json({ applications: data });
    return;
  }
);
router.get(
  '/my-with-applications',
  verifyJWT,
  async (req: Request, res: Response) => {
    const userId = (req as AuthRequest).user?.userId;

    const { data, error } = await supabase
      .from('tenders')
      .select(`
        id,
  title,
  description,
  deadline,
  budget,
  applications (
    id,
    proposal_text,
    applicant_id,
    status,
    created_at
        )
      `)
      .eq('creator_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Tenders with applications error:', error.message);
      res.status(500).json({ message: error.message });
      return;
    }

    res.json({ tenders: data });
  }
);


router.get('/search', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  const query = (req.query.q as string)?.toLowerCase();
  const userId = (req as AuthRequest).user?.userId;

  if (!query) {
    res.status(400).json({ message: 'Search query is required' });
    return;
  }

  // 1. Fetch all others' tenders and their users
  const { data, error } = await supabase
    .from('tenders')
    .select(`
      title,
      description,
      budget,
      deadline,
      creator_id
    `)
    .neq('creator_id', userId)
    .or(
      `title.ilike.%${query}%,description.ilike.%${query}%`
    )
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Search route supabase error:', error.message);
    res.status(500).json({ message: error.message });
    return;
  }

  // 2. Filter results in JavaScript instead of SQL
  const filtered = data.filter((tender: any) =>
  tender.title?.toLowerCase().includes(query) ||
  tender.description?.toLowerCase().includes(query) ||
  tender.users?.industry?.toLowerCase().includes(query) || // <- use `any` here
  tender.users?.company_name?.toLowerCase().includes(query)
);


  res.json({ tenders: filtered });
});


export default router;
