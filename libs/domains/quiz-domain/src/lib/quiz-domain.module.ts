import { Module } from '@nestjs/common';
import { QuizDomainController } from './quiz-domain.controller';
import { QuizDomainService } from './quiz-domain.service';

@Module({
  controllers: [QuizDomainController],
  providers: [QuizDomainService],
  exports: [QuizDomainService],
})
export class QuizDomainModule {}
