import { Test } from '@nestjs/testing';
import { AssetDomainService } from './asset-domain.service';

describe('AssetDomainService', () => {
  let service: AssetDomainService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [AssetDomainService],
    }).compile();

    service = module.get(AssetDomainService);
  });

  it('should be defined', () => {
    expect(service).toBeTruthy();
  });
});
