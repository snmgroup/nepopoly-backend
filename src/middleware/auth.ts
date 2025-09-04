import { Request, Response, NextFunction } from 'express';
import { verifyJwtGetUser } from '../auth';

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const user = await verifyJwtGetUser(token);
    req.user = user;
    next();
  } catch (e:any) {
    res.status(401).json({ error: 'Invalid token' });
  }
};
