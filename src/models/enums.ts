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
}

export enum ScoreModifier {
	DoublePointsAt69 = 0,
	reserved = 1,
}
export enum SessionAchievement {
  // 0–99: Triples / Variants / Budget
  TrippleSixty = 0,
  TrippleForty = 1,
  AllTwentyVariantsSameGame = 2,
  AllTwentyVariantsSameRound = 3,
  BudgetTrippleTwenty = 4,

  // 100–199: Score thresholds (Adjusted + Raw)
  ScoreAtLeast50InOneRound = 100,
  ScoreAtLeast50InOneRoundRaw = 101,
  ScoreAtLeast60InOneRound = 102,
  ScoreAtLeast60InOneRoundRaw = 103,
  ScoreAtLeast70InOneRound = 104,
  ScoreAtLeast70InOneRoundRaw = 105,
  ScoreAtLeast80InOneRound = 106,
  ScoreAtLeast80InOneRoundRaw = 107,
  ScoreAtLeast90InOneRound = 108,
  ScoreAtLeast90InOneRoundRaw = 109,
  ScoreAtLeast100InOneRound = 110,
  ScoreAtLeast100InOneRoundRaw = 111,
  ScoreAtLeast110InOneRound = 112,
  ScoreAtLeast110InOneRoundRaw = 113,
  ScoreAtLeast120InOneRound = 114,
  ScoreAtLeast120InOneRoundRaw = 115,
  ScoreAtLeast130InOneRound = 116,
  ScoreAtLeast130InOneRoundRaw = 117,
  ScoreAtLeast140InOneRound = 118,
  ScoreAtLeast140InOneRoundRaw = 119,
  ScoreAtLeast150InOneRound = 120,
  ScoreAtLeast150InOneRoundRaw = 121,
  ScoreAtLeast160InOneRound = 122,
  ScoreAtLeast160InOneRoundRaw = 123,
  ScoreAtLeast170InOneRound = 124,
  ScoreAtLeast170InOneRoundRaw = 125,
  ScoreAtLeast180InOneRound = 126,
  ScoreAtLeast180InOneRoundRaw = 127,

  // 200–299: Classic
  Classic1 = 200,
  Classic2 = 201,
  Classic3 = 202,
  Classic4 = 203,
  Classic5 = 204,
  Classic6 = 205,
  Classic7 = 206,
  Classic8 = 207,
  Classic9 = 208,
  Classic10 = 209,
  Classic11 = 210,
  Classic12 = 211,
  Classic13 = 212,
  Classic14 = 213,
  Classic15 = 214,
  Classic16 = 215,
  Classic17 = 216,
  Classic18 = 217,
  Classic19 = 218,
  Classic20 = 219,
  ClassicAnyDouble = 220,
  ClassicAnyTripple = 221,

  // 300–399: Range King
  RangeKing50 = 300,
  RangeKing60 = 301,
  RangeKing70 = 302,
  RangeKing80 = 303,
  RangeKing90 = 304,
  RangeKing100 = 305,
  RangeKing110 = 306,
  RangeKing120 = 307,
  RangeKing130 = 308,
  RangeKing140 = 309,
  RangeKing150 = 310,
  RangeKing160 = 311,
  RangeKing170 = 312,
  RangeKing180 = 313,

  // 400–499: Finishes
  FinishOnRound2 = 400,
  FinishOnRound3 = 401,
  FinishOnRound4 = 402,
  FinishOnRound5 = 403,
  FinishWithBull = 404,
  FinishWithDoubleBull = 405,
  FinishWithDouble = 406,
  FinishWithTripple = 407,

  // 500-599: Memes
  MaggaSlayer = 500
}


export enum ProgressAchievement {
	Everything = 0,
}

export enum AchievementTier {
    bronze = 1,
    silver = 2,
    gold = 3,
    platinum = 4,
    diamond = 5
}

export enum AchievementType {
    RangeKing,
    TwentyRelated,
    VictoryRelated,
    Classic,
    PointsRelated,
    PointsRelatedRaw,
    Progression,
	Meme
}