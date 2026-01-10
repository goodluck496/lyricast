// @ts-nocheck
export * from './auth.service';
import { AuthService } from './auth.service';
export * from './auth.serviceInterface'
export * from './catalogs.service';
import { CatalogsService } from './catalogs.service';
export * from './catalogs.serviceInterface'
export * from './health.service';
import { HealthService } from './health.service';
export * from './health.serviceInterface'
export * from './songs.service';
import { SongsService } from './songs.service';
export * from './songs.serviceInterface'
export const APIS = [AuthService, CatalogsService, HealthService, SongsService];
