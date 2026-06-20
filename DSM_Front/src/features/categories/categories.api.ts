import { apiRequest } from '@/lib/api/http-client';

export type Category = {
  id: string;
  userId: string | null;
  name: string;
  color: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateCategoryRequest = {
  name: string;
  color: string;
};

export type UpdateCategoryRequest = Partial<CreateCategoryRequest>;

export function getCategories(): Promise<Category[]> {
  return apiRequest<Category[]>('/categories');
}

export function createCategory(body: CreateCategoryRequest): Promise<Category> {
  return apiRequest<Category>('/categories', { method: 'POST', body });
}

export function updateCategory(
  id: string,
  body: UpdateCategoryRequest,
): Promise<Category> {
  return apiRequest<Category>(`/categories/${id}`, { method: 'PATCH', body });
}

export function deleteCategory(id: string): Promise<void> {
  return apiRequest<void>(`/categories/${id}`, { method: 'DELETE' });
}
