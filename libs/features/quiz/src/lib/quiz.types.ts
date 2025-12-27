export type QuizTeamHistoryKind = 'correct' | 'wrong' | 'manual_bonus' | 'manual_penalty';

export interface QuizTeamHistoryEntry {
  id: string;
  timestamp: number;
  topicTitle: string;
  questionText: string;
  points: number;
  kind: QuizTeamHistoryKind;
}

export interface QuizTeamState {
  id: string;
  name: string;
  score: number;
  members: { id: string; name: string }[];
  history?: QuizTeamHistoryEntry[];
}

export interface QuizTopicQuestionState {
  id: string;
  text: string;
  answer: string;
  points: number;
  seconds: number;
}

export interface QuizTopicState {
  id: string;
  title: string;
  questions: QuizTopicQuestionState[];
}

export interface QuizState {
  teams: QuizTeamState[];
  topics: QuizTopicState[];
}

export interface QuizSummary {
  id: string;
  title: string;
  date?: string;
}
