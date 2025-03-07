import { z } from "zod";
import { SeasonStatisticsSchema } from "./seasonStatisticsSchema.js";

export const UserSchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    alias: z.string(),
    seasonStatistics: z.array(SeasonStatisticsSchema),
  });

export type User = z.infer<typeof UserSchema>;
