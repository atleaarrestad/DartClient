export enum RoundStatus {
	Valid = 0,
	Overshoot = 1,
	Victory = 2,
	WinConditionFailed = 3,
	Unplayed = 4,
}

export enum ThrowType {
	Triple = 2,
	Double = 1,
	Single = 0,
	Rim = 3,
	Miss = 4,
}

export enum WinCondition {
	MustHitBoard = 0,
	MustReachExactGoal = 1,
	MustHitBoardIfNotWinByMultiplier = 2

}

export enum ScoreModifier {
	DoublePointsAt69 = 0,
}

export enum GameConstraint {
	MaximumRounds = 0,
	FinalPlayerExtraRounds = 1,
}

export enum AchievementTier {
    bronze = 1,
    silver = 2,
    gold = 3,
    platinum = 4,
    diamond = 5
}

/** Lowest to highest. Reverse a copy for highest-first displays. */
export const achievementTiersAscending: readonly AchievementTier[] = [
	AchievementTier.bronze,
	AchievementTier.silver,
	AchievementTier.gold,
	AchievementTier.platinum,
	AchievementTier.diamond,
];
