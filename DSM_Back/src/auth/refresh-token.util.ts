import { UnauthorizedException } from '@nestjs/common';

export type ParsedRefreshToken = {
  id: string;
  secret: string;
};

export function parseRefreshToken(token: string): ParsedRefreshToken {
  const idx = token.indexOf('.');
  if (idx <= 0 || idx === token.length - 1) {
    throw new UnauthorizedException('Invalid or expired refresh token');
  }

  return { id: token.slice(0, idx), secret: token.slice(idx + 1) };
}
