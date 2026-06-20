import { apiRequest } from '@/lib/api/http-client';

export type TaskDifficulty = 'LOW' | 'MEDIUM' | 'HIGH';
export type TaskStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED';

export type Task = {
  id: string;
  userId: string;
  categoryId: string | null;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  difficulty: TaskDifficulty;
  status: TaskStatus;
  notificationEnabled: boolean;
  completedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateTaskRequest = {
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  difficulty: TaskDifficulty;
  categoryId?: string;
  notificationEnabled?: boolean;
};

export type UpdateTaskRequest = Partial<
  Omit<CreateTaskRequest, 'notificationEnabled'> & {
    notificationEnabled: boolean;
    status: TaskStatus;
  }
>;

export function getTasksByDate(date: string): Promise<Task[]> {
  return apiRequest<Task[]>(`/tasks?date=${encodeURIComponent(date)}`);
}

export function createTask(body: CreateTaskRequest): Promise<Task> {
  return apiRequest<Task>('/tasks', { method: 'POST', body });
}

export function updateTask(
  id: string,
  body: UpdateTaskRequest,
): Promise<Task> {
  return apiRequest<Task>(`/tasks/${id}`, { method: 'PATCH', body });
}

export function deleteTask(id: string): Promise<void> {
  return apiRequest<void>(`/tasks/${id}`, { method: 'DELETE' });
}

export function completeTask(id: string): Promise<Task> {
  return apiRequest<Task>(`/tasks/${id}/complete`, { method: 'PATCH' });
}
