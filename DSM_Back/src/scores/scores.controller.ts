import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { DailyScore, Tier } from '@prisma/client';
import { ScoresService } from './scores.service';
import { ScoreQueryDto } from './dto/score-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';

type AuthRequest = Request & { user: JwtPayload };

@Controller('scores')
@UseGuards(JwtAuthGuard)
export class ScoresController {
  constructor(private readonly scoresService: ScoresService) {}

  @Get()
  getDaily(
    @Req() req: AuthRequest,
    @Query() query: ScoreQueryDto,
  ): Promise<DailyScore | null> {
    return this.scoresService.getDaily(req.user.sub, query.date ?? new Date());
  }

  @Get('summary')
  getSummary(
    @Req() req: AuthRequest,
  ): Promise<{ totalScore: number; tier: Tier }> {
    return this.scoresService.getSummary(req.user.sub);
  }
}
