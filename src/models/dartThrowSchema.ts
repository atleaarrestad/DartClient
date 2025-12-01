import { z } from 'zod';

import { ScoreModifier, ThrowType } from './enums.js'; // Import the enums


export const DartThrowSchema = z.object({
	hitLocation:        z.number().min(0).max(50), // Dartboard number 0-20, 25, 50
	throwType:          z.nativeEnum(ThrowType), // Now using ThrowType enum
	finalPoints:        z.number().min(0), // Must be non-negative
	throwIndex:         z.number().int().min(0).max(2), // 0-2 for three throws per round
	activatedModifiers: z.array(z.nativeEnum(ScoreModifier)), // Uses ScoreModifier enum
});

export type DartThrow = z.infer<typeof DartThrowSchema>;
