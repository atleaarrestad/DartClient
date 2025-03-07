import { z } from "zod";
import { Rank } from "./rank.js";

export const SeasonStatisticsSchema = z.object({
    id: z.number(),
    userId: z.string().uuid(),
    seasonId: z.string().uuid(),
    currentRank: z.nativeEnum(Rank), // Validate against Rank enum
    highestAchievedRank: z.nativeEnum(Rank), // Validate against Rank enum
    mmr: z.number(),
  });

export type SeasonStatistics = z.infer<typeof SeasonStatisticsSchema>;
