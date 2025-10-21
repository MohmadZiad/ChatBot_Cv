import { z } from 'zod';
export const CreateJobDTO = z.object({
  title: z.string().min(2),
  description: z.string().min(10)
});
export type CreateJobInput = z.infer<typeof CreateJobDTO>;
