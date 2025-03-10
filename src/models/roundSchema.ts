import { z } from "zod";
import { RoundStatus } from "./enums.js"; 
import {DartThrowSchema} from "./dartThrowSchema.js"

export const RoundSchema = z.object({
    roundNumber: z.number().int().min(0), // Must be a valid round number
    dartThrows: z.array(DartThrowSchema).min(1).max(3), // Allows 1, 2, or 3 throws
    cumulativePoints: z.number().min(0), // Total points accumulated up to this round
    roundStatus: z.nativeEnum(RoundStatus), // Uses RoundStatus enum
  });
  
  export type Round = z.infer<typeof RoundSchema>;