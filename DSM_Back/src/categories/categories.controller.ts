import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Category } from '@prisma/client';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';

type AuthRequest = Request & { user: JwtPayload };

@Controller('categories')
@UseGuards(JwtAuthGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  create(
    @Req() req: AuthRequest,
    @Body() dto: CreateCategoryDto,
  ): Promise<Category> {
    return this.categoriesService.create(req.user.sub, dto);
  }

  @Get()
  findAll(@Req() req: AuthRequest): Promise<Category[]> {
    return this.categoriesService.findAll(req.user.sub);
  }

  @Get(':id')
  findOne(@Req() req: AuthRequest, @Param('id') id: string): Promise<Category> {
    return this.categoriesService.findOne(req.user.sub, id);
  }

  @Patch(':id')
  update(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<Category> {
    return this.categoriesService.update(req.user.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ): Promise<void> {
    await this.categoriesService.remove(req.user.sub, id);
  }
}
