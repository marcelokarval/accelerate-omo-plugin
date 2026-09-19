import { z } from "zod";

export const WorkerCompletionReportSchema = z.object({
  delegationId: z.string().min(1),
  taskSlug: z.string().min(1),
  status: z.enum(["success", "failed"]),
  touchedFiles: z.array(z.string()),
  testResults: z.object({
    command: z.string(),
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    exitCode: z.number().int(),
  }),
  buildStatus: z.enum(["clean", "failed"]),
  diffSummary: z.string(),
  invariantsSatisfied: z.array(z.string()).default([]),
});

export type WorkerCompletionReport = z.infer<typeof WorkerCompletionReportSchema>;
