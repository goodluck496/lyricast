import { Test } from '@nestjs/testing';
import { AssetDomainController } from './asset-domain.controller';
import { AssetDomainService } from './asset-domain.service';

describe('AssetDomainController', () => {
  let controller: AssetDomainController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [AssetDomainService],
      controllers: [AssetDomainController],
    }).compile();

    controller = module.get(AssetDomainController);
  });

  it('should be defined', () => {
    expect(controller).toBeTruthy();
  });
});
