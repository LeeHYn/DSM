import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { RankingSnapshot } from '@prisma/client';
import { RankingsService } from './rankings.service';
import type { MyRanking, LeaderboardEntry } from './rankings.service';
import { RankingQueryDto } from './dto/ranking-query.dto';
import { LeaderboardQueryDto } from './dto/leaderboard-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';

type AuthRequest = Request & { user: JwtPayload };

@Controller('rankings')
@UseGuards(JwtAuthGuard)
export class RankingsController {
  constructor(private readonly rankingsService: RankingsService) {}

  @Get()
  getMyRanking(
    @Req() req: AuthRequest,
    @Query() query: RankingQueryDto,
  ): Promise<MyRanking> {
    return this.rankingsService.getMyRanking(req.user.sub, query.period);
  }

  @Get('leaderboard')
  getLeaderboard(
    @Query() query: LeaderboardQueryDto,
  ): Promise<LeaderboardEntry[]> {
    return this.rankingsService.getLeaderboard(
      query.period,
      query.limit ?? 100,
    );
  }

  @Post('snapshot')
  createSnapshot(
    @Req() req: AuthRequest,
    @Body() body: RankingQueryDto,
  ): Promise<RankingSnapshot> {
    return this.rankingsService.createSnapshot(req.user.sub, body.period);
  }
}
