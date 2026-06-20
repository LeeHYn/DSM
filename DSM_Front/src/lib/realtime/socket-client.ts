import { io, type Socket } from 'socket.io-client';

import { getWebSocketUrl } from '@/config/env';
import type { RankingPeriod } from '@/features/rankings/rankings.api';

export type DsmSocket = Socket;

export function createDsmSocket(accessToken: string): DsmSocket {
  return io(getWebSocketUrl(), {
    transports: ['websocket'],
    auth: { token: accessToken },
    autoConnect: false,
  });
}

export function subscribeRanking(
  socket: DsmSocket,
  period: RankingPeriod,
): void {
  socket.emit('ranking.subscribe', { period });
}

export function unsubscribeRanking(
  socket: DsmSocket,
  period: RankingPeriod,
): void {
  socket.emit('ranking.unsubscribe', { period });
}
