import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { QuizDomainService } from './quiz-domain.service';
import { QuizSummaryDto, SaveQuizPayloadDto } from '@lyri-cast/entities';

@Controller('quiz')
export class QuizDomainController {
  constructor(private readonly quizDomainService: QuizDomainService) {}

  @Get('list')
  async getQuizList(): Promise<QuizSummaryDto[]> {
    return this.quizDomainService.listQuizzes();
  }

  @Get(':id')
  async getQuizById(@Param('id') id: string): Promise<unknown | null> {
    return this.quizDomainService.loadQuizById(id);
  }

  @Post()
  async saveQuiz(@Body() payload: SaveQuizPayloadDto): Promise<{ id: string }> {
    return this.quizDomainService.saveQuizAsNew(payload);
  }

  @Delete(':id')
  async deleteQuiz(@Param('id') id: string): Promise<void> {
    await this.quizDomainService.deleteQuiz(id);
  }
}
