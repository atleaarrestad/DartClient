export enum RoundStatus {
	Valid = 0,
	Overshoot = 1,
	Victory = 2,
	WinConditionFailed = 3,
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
}

export enum ScoreModifier {
	DoublePointsAt69 = 0,
	reserved = 1,
}
