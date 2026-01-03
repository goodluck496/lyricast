export interface QuizTeamHistoryEntryDto {
  id: string;
  timestamp: number;
  topicTitle: string;
  questionText: string;
  points: number;
  kind: 'correct' | 'wrong' | 'manual_bonus' | 'manual_penalty';
}

export interface QuizTeamStateDto {
  id: string;
  name: string;
  score: number;
  members: { id: string; name: string }[];
  history?: QuizTeamHistoryEntryDto[];
}

export interface QuizTopicQuestionStateDto {
  id: string;
  text: string;
  answer: string;
  points: number;
  seconds: number;
}

export interface QuizTopicStateDto {
  id: string;
  title: string;
  questions: QuizTopicQuestionStateDto[];
}

export interface QuizStateDto {
  teams: QuizTeamStateDto[];
  topics: QuizTopicStateDto[];
}

export interface QuizSummaryDto {
  id: string;
  title: string;
  date?: string;
}

export interface SaveQuizPayloadDto {
  id?: string;
  title?: string;
  date?: string;
  state: QuizStateDto;
}
