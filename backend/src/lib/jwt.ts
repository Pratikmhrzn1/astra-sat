import jwt from 'jsonwebtoken';

const ACCESS_SECRET = process.env.JWT_SECRET || 'fallback-dev-secret';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'fallback-dev-refresh-secret';

export interface TokenPayload {
  sub: string;
  email: string;
  role: string;
  name: string;
}

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: '15m' });
}

export function signRefreshToken(payload: Pick<TokenPayload, 'sub'>): string {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: '7d' });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, ACCESS_SECRET) as TokenPayload;
}

export function verifyRefreshToken(token: string): Pick<TokenPayload, 'sub'> {
  return jwt.verify(token, REFRESH_SECRET) as Pick<TokenPayload, 'sub'>;
}
